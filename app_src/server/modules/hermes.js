// @bun
// Hermes gateway / dashboard / 安装 / 重启
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, chmodSync } from "fs";
import { createServer } from "net";
import { broadcastLog } from "./logger.js";

const DATA_DIR = process.env.HERMES_DATA_DIR || "/var/apps/com.nousresearch.hermes/home/data";
const VENV_DIR = process.env.HERMES_VENV || `${DATA_DIR}/venv`;
const HERMES_BIN = process.env.HERMES_BIN || `${VENV_DIR}/bin/hermes`;
const LOG_DIR = `${DATA_DIR}/logs`;
const RUNTIME_DIR = `${DATA_DIR}/runtime`;
const PID_FILE = `${RUNTIME_DIR}/gateway.pid`;
const DASHBOARD_PID_FILE = `${RUNTIME_DIR}/dashboard.pid`;
const DASHBOARD_PORT = parseInt(process.env.HERMES_DASHBOARD_PORT || "9119");

for (const d of [LOG_DIR, RUNTIME_DIR]) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
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

export function isInstallInProgress() {
  return installInProgress;
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
  const logFile = `${LOG_DIR}/gateway.log`;
  const logFd = Bun.file(logFile).writer();
  const env = {
    ...process.env,
    HERMES_HOME: `${DATA_DIR}/home`,
    HOME: `${DATA_DIR}/home`
  };
  gatewayProcess = Bun.spawn([HERMES_BIN, "gateway", "run"], { env, stdout: "pipe", stderr: "pipe", cwd: DATA_DIR });
  processStartTimes.set(gatewayProcess.pid, Date.now());
  writeFileSync(PID_FILE, String(gatewayProcess.pid));
  (async () => {
    const reader = gatewayProcess.stdout.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = new TextDecoder().decode(value);
        logFd.write(text).catch(() => {});
        broadcastLog("[gateway] " + text);
      }
    } catch {}
  })();
  (async () => {
    const reader = gatewayProcess.stderr.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = new TextDecoder().decode(value);
        logFd.write(text).catch(() => {});
        broadcastLog("[gateway] " + text);
      }
    } catch {}
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
  if (isDashboardRunning()) return { ok: true, message: "already running", pid: getDashboardPid(), port: DASHBOARD_PORT };
  if (!existsSync(HERMES_BIN)) return { ok: false, error: "hermes not installed yet" };

  // 安全：启动前检测端口占用，避免启动在已被占用的端口上
  if (await isPortInUse(DASHBOARD_PORT)) {
    return { ok: false, error: `端口 ${DASHBOARD_PORT} 已被占用，请修改 HERMES_DASHBOARD_PORT 后重试` };
  }

  const logFile = `${LOG_DIR}/dashboard.log`;
  const env = {
    ...process.env,
    HERMES_HOME: `${DATA_DIR}/home`,
    HOME: `${DATA_DIR}/home`
    // 移除 HERMES_DASHBOARD_INSECURE 与 --insecure，不再关闭安全校验
  };
  // 安全：Dashboard 在 non-loopback 绑定下强制要求 OAuth provider；
  // 内网 NAS 无 provider 时，默认绑定 127.0.0.1 并通过面板反向代理访问，
  // 避免直接暴露无认证 Dashboard 到网络。
  const dashboardHost = process.env.HERMES_DASHBOARD_HOST || "127.0.0.1";
  const dashboardInsecure = process.env.HERMES_DASHBOARD_INSECURE === "1";
  const dashboardArgs = [HERMES_BIN, "dashboard", "--host", dashboardHost, "--port", String(DASHBOARD_PORT), "--skip-build", "--no-open"];
  if (dashboardInsecure) {
    dashboardArgs.push("--insecure");
  }
  dashboardProcess = Bun.spawn(dashboardArgs, { env, stdout: "pipe", stderr: "pipe", cwd: DATA_DIR });
  processStartTimes.set(dashboardProcess.pid, Date.now());
  writeFileSync(DASHBOARD_PID_FILE, String(dashboardProcess.pid));
  (async () => {
    const reader = dashboardProcess.stdout.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = new TextDecoder().decode(value);
        Bun.write(logFile, text, { append: true }).catch(() => {});
        broadcastLog("[dashboard] " + text);
      }
    } catch {}
  })();
  (async () => {
    const reader = dashboardProcess.stderr.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = new TextDecoder().decode(value);
        Bun.write(logFile, text, { append: true }).catch(() => {});
        broadcastLog("[dashboard] " + text);
      }
    } catch {}
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
  } catch {}
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
  } catch {}
  return args;
}

export async function installHermes(packageSpec) {
  if (installInProgress) return { ok: false, error: "Installation already in progress" };
  if (existsSync(HERMES_BIN)) return { ok: true, message: "already installed", bin: HERMES_BIN };
  installInProgress = true;
  broadcastLog("[install] Starting Hermes installation ...\n");
  try {
    let pythonBin = null;
    for (const py of ["python3.12", "python3.11", "python3.10", "python3"]) {
      try {
        const proc = Bun.spawn([py, "--version"], { stdout: "pipe", stderr: "pipe" });
        const exitCode2 = await proc.exited;
        if (exitCode2 === 0) { pythonBin = py; break; }
      } catch {}
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
    broadcastLog(`[install] Installing ${packageSpec} ...\n`);
    const installProc = Bun.spawn([pip, "install", packageSpec, "-q", ...pipIndexArgs], { stdout: "pipe", stderr: "pipe" });
    (async () => {
      const reader = installProc.stderr.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          broadcastLog(new TextDecoder().decode(value));
        }
      } catch {}
    })();
    const exitCode = await installProc.exited;
    if (exitCode !== 0) {
      broadcastLog(`[install] pip install failed (exit ${exitCode}), trying GitHub source ...\n`);
      const ghProc = Bun.spawn([pip, "install", "git+https://github.com/NousResearch/hermes.git", "-q"], { stdout: "pipe", stderr: "pipe" });
      const ghExit = await ghProc.exited;
      if (ghExit !== 0) { installInProgress = false; return { ok: false, error: `pip install failed (exit ${exitCode}, github ${ghExit})` }; }
    }
    if (!existsSync(HERMES_BIN)) { installInProgress = false; return { ok: false, error: "hermes binary not found after install" }; }
    try { chmodSync(HERMES_BIN, 493); } catch {}
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
