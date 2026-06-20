// @bun
// Hermes gateway / dashboard / 安装 / 重启
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, chmodSync } from "fs";
import { createServer } from "net";
import { broadcastLog } from "./logger.js";
import { swallowError } from "./error.js";

const DATA_DIR = process.env.HERMES_DATA_DIR || "/var/apps/com.nousresearch.hermes/home/data";
const VENV_DIR = process.env.HERMES_VENV || `${DATA_DIR}/venv`;
const HERMES_BIN = process.env.HERMES_BIN || `${VENV_DIR}/bin/hermes`;
const LOG_DIR = `${DATA_DIR}/logs`;
const RUNTIME_DIR = `${DATA_DIR}/runtime`;
const PID_FILE = `${RUNTIME_DIR}/gateway.pid`;
const DASHBOARD_PID_FILE = `${RUNTIME_DIR}/dashboard.pid`;
const HERMES_HOME = process.env.HERMES_HOME || `${DATA_DIR}/home`;
const ENV_FILE = `${HERMES_HOME}/.env`;

// v0.30.6: 启动时的初始端口仅用于尚无 .env 时的兜底。
// 真正生效的端口/模式由 readDashboardEnv() 在每次启动 Dashboard 前重新读 .env 决定，
// 这样面板内修改端口/访问模式后只需重启 Dashboard，不必重启整个应用。
const INITIAL_DASHBOARD_PORT = parseInt(process.env.HERMES_DASHBOARD_PORT || "9119");

function readDashboardEnv() {
  let port = INITIAL_DASHBOARD_PORT;
  let insecure = process.env.HERMES_DASHBOARD_INSECURE !== "0";
  if (existsSync(ENV_FILE)) {
    try {
      const text = readFileSync(ENV_FILE, "utf-8");
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq < 1) continue;
        const k = line.slice(0, eq).trim();
        const v = line.slice(eq + 1).trim();
        if (k === "HERMES_DASHBOARD_PORT") {
          const p = parseInt(v);
          if (Number.isInteger(p) && p >= 1024 && p <= 65535) port = p;
        } else if (k === "HERMES_DASHBOARD_INSECURE") {
          insecure = v !== "0";
        }
      }
    } catch (err) {
      swallowError("read .env for dashboard", err);
    }
  }
  return { port, insecure };
}

// 兼容旧导出：返回当前文件里读取的端口；调用方期望它是常量数字时仍可工作。
let DASHBOARD_PORT = INITIAL_DASHBOARD_PORT;
try {
  DASHBOARD_PORT = readDashboardEnv().port;
} catch {}

// v0.30.6: 给 index.js 用的动态端口/模式 getter，每次都读 .env 而不是缓存值
export function getDashboardPort() {
  try { return readDashboardEnv().port; } catch { return DASHBOARD_PORT; }
}
export function getDashboardInsecure() {
  try { return readDashboardEnv().insecure; } catch { return process.env.HERMES_DASHBOARD_INSECURE !== "0"; }
}


for (const d of [LOG_DIR, RUNTIME_DIR]) {
  // 模块顶层 mkdir 是历史遗留：测试导入此模块时也会触发，
  // 因此用 try/catch 静默 EACCES，正式启动由 index.js 显式初始化。
  try {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  } catch { /* test env may lack write perm */ }
}

// 显式初始化：由 index.js 在启动时调用，确保关键目录存在
let _hermesInited = false;
export function initHermesModule() {
  if (_hermesInited) return;
  _hermesInited = true;
  for (const d of [LOG_DIR, RUNTIME_DIR]) {
    try {
      if (!existsSync(d)) mkdirSync(d, { recursive: true });
    } catch { /* logger will surface error if perms truly missing */ }
  }
}

function isPortInUse(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", (err) => {
      resolve(err.code === "EADDRINUSE");
    });
    server.once("listening", () => {
      server.close(() => resolve(false));
    });
    server.listen(port, host);
  });
}

let gatewayProcess = null;
let dashboardProcess = null;
let installInProgress = false;
const processStartTimes = new Map();

const DEFAULT_PACKAGE_SPEC = "hermes-agent";
const OFFICIAL_GIT_SPEC = "git+https://github.com/NousResearch/hermes.git";
const ALLOWED_PACKAGE_SPECS = new Set([DEFAULT_PACKAGE_SPEC, OFFICIAL_GIT_SPEC]);

export function isInstallInProgress() {
  return installInProgress;
}

// 校验 pip 包规格：默认只允许官方 PyPI 包或官方 Git 源。
// 当 HERMES_ALLOW_CUSTOM_PACKAGE=1 时，允许用户传入自定义 PyPI/ Git 源规格，
// 但仍禁止 shell 元字符、file://、-- 选项等危险内容。
export function validatePackageSpec(packageSpec) {
  if (!packageSpec || typeof packageSpec !== "string") {
    return { ok: false, error: "packageSpec is required" };
  }
  if (packageSpec.length > 200) {
    return { ok: false, error: "packageSpec too long" };
  }

  // 内置白名单
  if (ALLOWED_PACKAGE_SPECS.has(packageSpec.trim())) {
    return { ok: true };
  }

  // 未开启自定义源开关时，直接拒绝
  if (process.env.HERMES_ALLOW_CUSTOM_PACKAGE !== "1") {
    return { ok: false, error: "Custom package source is not allowed. Use hermes-agent or enable HERMES_ALLOW_CUSTOM_PACKAGE=1." };
  }

  const spec = packageSpec.trim();

  // 禁止明显的危险字符与模式（保留 < > 用于版本约束，如 >=、<=、<、>）
  if (/[;|&$(){}\`'"\s]/.test(spec)) {
    return { ok: false, error: "packageSpec contains disallowed characters" };
  }
  if (spec.startsWith("-") || spec.includes("--")) {
    return { ok: false, error: "packageSpec must not contain pip option flags" };
  }
  if (/^(file|http|https|ftp|s3):/i.test(spec)) {
    return { ok: false, error: "packageSpec must not contain arbitrary URLs" };
  }

  // 允许两种形式：
  // 1) PyPI 风格：name[extras](==|>=|...)version，允许 , 组合多个约束
  // 2) git+https:// 官方 Git 源
  const pypiRe = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\[[A-Za-z0-9_,.-]+\])?(?:\s*(?:==|>=|<=|~=|!=|>|<)\s*[A-Za-z0-9._*+!-]+(?:\s*,\s*(?:==|>=|<=|~=|!=|>|<)\s*[A-Za-z0-9._*+!-]+)*)?$/;
  const gitRe = /^git\+https:\/\/[A-Za-z0-9._/-]+\/[A-Za-z0-9._/-]+(?:\.git)?(?:@[A-Za-z0-9._-]+)?$/;

  if (pypiRe.test(spec) || gitRe.test(spec)) {
    return { ok: true };
  }

  return { ok: false, error: "packageSpec format not allowed" };
}

function getProcessUptime(pid) {
  if (!pid) return null;
  const started = processStartTimes.get(pid);
  if (started) {
    const seconds = Math.floor((Date.now() - started) / 1000);
    return seconds;
  }
  return null;
}

function formatUptime(seconds) {
  if (seconds === null || seconds === undefined) return null;
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return `${h}h ${rm}m`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return `${d}d ${rh}h`;
}

export function getGatewayUptime() {
  return formatUptime(getProcessUptime(getGatewayPid()));
}

export function getDashboardUptime() {
  return formatUptime(getProcessUptime(getDashboardPid()));
}

function isProcessAlive(pid, expectedName = null) {
  if (!pid || isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  if (!expectedName) return true;
  try {
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf-8");
    // /proc/PID/cmdline 中参数以 \0 分隔
    return cmdline.includes(expectedName);
  } catch {
    return true; // 无法读取时保守认为存活，避免误杀
  }
}

export function isGatewayRunning() {
  if (gatewayProcess && gatewayProcess.pid) {
    if (isProcessAlive(gatewayProcess.pid, "hermes")) return true;
    gatewayProcess = null;
  }
  if (existsSync(PID_FILE)) {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim());
    if (isProcessAlive(pid, "hermes")) return true;
    try { unlinkSync(PID_FILE); } catch {}
  }
  return false;
}

export function getGatewayPid() {
  if (gatewayProcess?.pid) return gatewayProcess.pid;
  if (existsSync(PID_FILE)) {
    return parseInt(readFileSync(PID_FILE, "utf-8").trim()) || null;
  }
  return null;
}

export async function startGateway() {
  if (isGatewayRunning()) return { ok: true, message: "already running", pid: getGatewayPid() };
  if (!existsSync(HERMES_BIN)) return { ok: false, error: "hermes binary not found. Reinstall the app." };
  const env = {
    ...process.env,
    HERMES_HOME: `${DATA_DIR}/home`,
    HOME: `${DATA_DIR}/home`
  };
  gatewayProcess = Bun.spawn([HERMES_BIN, "gateway", "run"], { env, stdout: "pipe", stderr: "pipe", cwd: DATA_DIR });
  processStartTimes.set(gatewayProcess.pid, Date.now());
  writeFileSync(PID_FILE, String(gatewayProcess.pid));
  try { chmodSync(PID_FILE, 0o640); } catch {}
  (async () => {
    const reader = gatewayProcess.stdout.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = new TextDecoder().decode(value);
        broadcastLog("[gateway] " + text);
      }
    } catch (err) {
      swallowError("gateway stdout reader", err);
    }
  })();
  (async () => {
    const reader = gatewayProcess.stderr.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = new TextDecoder().decode(value);
        broadcastLog("[gateway] " + text);
      }
    } catch (err) {
      swallowError("gateway stderr reader", err);
    }
  })();
  return { ok: true, message: "started", pid: gatewayProcess.pid };
}

export async function stopGateway() {
  if (!isGatewayRunning()) return { ok: true, message: "not running" };
  const pid = getGatewayPid();
  if (pid) {
    try { process.kill(pid, "SIGTERM"); } catch {}
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try { process.kill(pid, 0); } catch { break; }
    }
    try { process.kill(pid, "SIGKILL"); } catch {}
  }
  gatewayProcess = null;
  try { unlinkSync(PID_FILE); } catch {}
  return { ok: true, message: "stopped" };
}

export function isDashboardRunning() {
  if (dashboardProcess && dashboardProcess.pid) {
    if (isProcessAlive(dashboardProcess.pid, "hermes")) return true;
    dashboardProcess = null;
  }
  if (existsSync(DASHBOARD_PID_FILE)) {
    const pid = parseInt(readFileSync(DASHBOARD_PID_FILE, "utf-8").trim());
    if (isProcessAlive(pid, "hermes")) return true;
    try { unlinkSync(DASHBOARD_PID_FILE); } catch {}
  }
  return false;
}

export function getDashboardPid() {
  if (dashboardProcess?.pid) return dashboardProcess.pid;
  if (existsSync(DASHBOARD_PID_FILE)) {
    return parseInt(readFileSync(DASHBOARD_PID_FILE, "utf-8").trim()) || null;
  }
  return null;
}

export async function startDashboard() {
  // v0.30.6: 每次启动前从 .env 重新读取端口和访问模式，让面板内修改即时生效
  const { port, insecure } = readDashboardEnv();
  DASHBOARD_PORT = port;
  if (isDashboardRunning()) return { ok: true, message: "already running", pid: getDashboardPid(), port };
  if (!existsSync(HERMES_BIN)) return { ok: false, error: "hermes not installed yet" };

  const env = {
    ...process.env,
    HERMES_DASHBOARD_PORT: String(port),
    HERMES_DASHBOARD_INSECURE: insecure ? "1" : "0",
    HERMES_HOME: `${DATA_DIR}/home`,
    HOME: `${DATA_DIR}/home`
  };
  // 部署在 NAS 等家庭内网场景下，默认允许局域网直接访问 Dashboard；
  // 如需锁回仅本地访问，设置 HERMES_DASHBOARD_INSECURE=0。
  const dashboardInsecure = insecure;
  const dashboardHost = process.env.HERMES_DASHBOARD_HOST || (dashboardInsecure ? "0.0.0.0" : "127.0.0.1");
  if (await isPortInUse(port, dashboardHost)) {
    return { ok: false, error: `端口 ${port} 已被占用，请修改 HERMES_DASHBOARD_PORT 后重试` };
  }
  const dashboardArgs = [HERMES_BIN, "dashboard", "--host", dashboardHost, "--port", String(port), "--skip-build", "--no-open"];
  if (dashboardInsecure) {
    dashboardArgs.push("--insecure");
  }
  dashboardProcess = Bun.spawn(dashboardArgs, { env, stdout: "pipe", stderr: "pipe", cwd: DATA_DIR });
  processStartTimes.set(dashboardProcess.pid, Date.now());
  writeFileSync(DASHBOARD_PID_FILE, String(dashboardProcess.pid));
  try { chmodSync(DASHBOARD_PID_FILE, 0o640); } catch {}
  (async () => {
    const reader = dashboardProcess.stdout.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = new TextDecoder().decode(value);
        broadcastLog("[dashboard] " + text);
      }
    } catch (err) {
      swallowError("dashboard stdout reader", err);
    }
  })();
  (async () => {
    const reader = dashboardProcess.stderr.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = new TextDecoder().decode(value);
        broadcastLog("[dashboard] " + text);
      }
    } catch (err) {
      swallowError("dashboard stderr reader", err);
    }
  })();
  return { ok: true, message: "started", pid: dashboardProcess.pid, port: DASHBOARD_PORT };
}

export async function stopDashboard() {
  if (!isDashboardRunning()) return { ok: true, message: "not running" };
  const pid = getDashboardPid();
  if (pid) {
    try { process.kill(pid, "SIGTERM"); } catch {}
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try { process.kill(pid, 0); } catch { break; }
    }
    try { process.kill(pid, "SIGKILL"); } catch {}
  }
  try {
    const stopProc = Bun.spawn([HERMES_BIN, "dashboard", "--stop"], { stdout: "pipe", stderr: "pipe" });
    await stopProc.exited;
  } catch (err) {
    swallowError("dashboard --stop", err);
  }
  dashboardProcess = null;
  try { unlinkSync(DASHBOARD_PID_FILE); } catch {}
  return { ok: true, message: "stopped" };
}

function getPipIndexArgs() {
  const indexUrl = process.env.PIP_INDEX_URL || "https://pypi.tuna.tsinghua.edu.cn/simple";
  const args = ["-i", indexUrl];
  try {
    const u = new URL(indexUrl);
    if (u.hostname) args.push("--trusted-host", u.hostname);
  } catch (err) {
    swallowError("parse PIP_INDEX_URL", err);
  }
  return args;
}

export async function installHermes(packageSpec) {
  if (installInProgress) return { ok: false, error: "Installation already in progress" };
  if (existsSync(HERMES_BIN)) return { ok: true, message: "already installed", bin: HERMES_BIN };

  const resolvedSpec = packageSpec || DEFAULT_PACKAGE_SPEC;
  const validation = validatePackageSpec(resolvedSpec);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  installInProgress = true;
  broadcastLog("[install] Starting Hermes installation ...\n");
  try {
    let pythonBin = null;
    for (const py of ["python3.12", "python3.11", "python3.10", "python3"]) {
      try {
        const proc = Bun.spawn([py, "--version"], { stdout: "pipe", stderr: "pipe" });
        const exitCode2 = await proc.exited;
        if (exitCode2 === 0) { pythonBin = py; break; }
      } catch (err) {
        swallowError(`python probe ${py}`, err);
      }
    }
    if (!pythonBin) { installInProgress = false; return { ok: false, error: "Python 3.10+ not found" }; }
    broadcastLog(`[install] Using ${pythonBin}\n`);
    if (!existsSync(`${VENV_DIR}/bin/python`)) {
      broadcastLog("[install] Creating virtualenv ...\n");
      const venvProc = Bun.spawn([pythonBin, "-m", "venv", VENV_DIR], { stdout: "pipe", stderr: "pipe" });
      await venvProc.exited;
    }
    const pip = `${VENV_DIR}/bin/pip`;
    const pipIndexArgs = getPipIndexArgs();
    broadcastLog(`[install] Using pip index: ${pipIndexArgs[1]}\n`);
    broadcastLog("[install] Upgrading pip ...\n");
    const upgradeProc = Bun.spawn([pip, "install", "--upgrade", "pip", "wheel", "setuptools", "-q", ...pipIndexArgs], { stdout: "pipe", stderr: "pipe" });
    await upgradeProc.exited;
    broadcastLog(`[install] Installing ${resolvedSpec} ...\n`);
    const installProc = Bun.spawn([pip, "install", resolvedSpec, "-q", ...pipIndexArgs], { stdout: "pipe", stderr: "pipe" });
    (async () => {
      const reader = installProc.stderr.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          broadcastLog(new TextDecoder().decode(value));
        }
      } catch (err) {
        swallowError("install stderr reader", err);
      }
    })();
    const exitCode = await installProc.exited;
    if (exitCode !== 0) {
      // 显式 fallback：默认从 PyPI 失败后回退 GitHub 官方源；
      // 用户可设 HERMES_NO_FALLBACK=1 关闭，避免在限网环境下意外外联。
      if (process.env.HERMES_NO_FALLBACK === "1") {
        broadcastLog(`[install] ❌ pip install failed (exit ${exitCode}). HERMES_NO_FALLBACK=1, GitHub fallback disabled.\n`);
        installInProgress = false;
        return { ok: false, error: `pip install failed (exit ${exitCode}). Fallback disabled by HERMES_NO_FALLBACK=1.` };
      }
      broadcastLog(`[install] ⚠️ pip install failed (exit ${exitCode}). Falling back to GitHub: ${OFFICIAL_GIT_SPEC}\n`);
      broadcastLog(`[install]    To disable this fallback, set HERMES_NO_FALLBACK=1 in .env.\n`);
      const ghProc = Bun.spawn([pip, "install", OFFICIAL_GIT_SPEC, "-q"], { stdout: "pipe", stderr: "pipe" });
      const ghExit = await ghProc.exited;
      if (ghExit !== 0) { installInProgress = false; return { ok: false, error: `pip install failed (exit ${exitCode}, github ${ghExit})` }; }
      broadcastLog(`[install] ✓ GitHub fallback succeeded.\n`);
    }
    if (!existsSync(HERMES_BIN)) { installInProgress = false; return { ok: false, error: "hermes binary not found after install" }; }
    try { chmodSync(HERMES_BIN, 493); } catch (err) {
      swallowError("chmod hermes binary", err);
    }
    broadcastLog("[install] Hermes installed successfully.\n");
    installInProgress = false;
    return { ok: true, message: "installed", bin: HERMES_BIN };
  } catch (err) {
    installInProgress = false;
    return { ok: false, error: String(err) };
  }
}

export async function restartHermesAll() {
  broadcastLog("[restart] Stopping all Hermes services ...\n");
  const gwStop = await stopGateway();
  const dbStop = await stopDashboard();
  await new Promise((r) => setTimeout(r, 1000));
  broadcastLog("[restart] Starting gateway ...\n");
  const gwStart = await startGateway();
  await new Promise((r) => setTimeout(r, 1500));
  broadcastLog("[restart] Starting dashboard ...\n");
  const dbStart = await startDashboard();
  return { ok: gwStart.ok && dbStart.ok, gateway: gwStart, dashboard: dbStart, stopped: { gateway: gwStop, dashboard: dbStop } };
}
