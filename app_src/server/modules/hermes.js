// @bun
// Hermes gateway / dashboard / 安装 / 重启
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, chmodSync } from "fs";
import { broadcastLog } from "./logger.js";

const DATA_DIR = process.env.HERMES_DATA_DIR || "/var/apps/com.nousresearch.hermes/home/data";
const VENV_DIR = process.env.HERMES_VENV || `${DATA_DIR}/venv`;
const HERMES_BIN = process.env.HERMES_BIN || `${VENV_DIR}/bin/hermes`;
const CONFIG_DIR = `${DATA_DIR}/config`;
const LOG_DIR = `${DATA_DIR}/logs`;
const RUNTIME_DIR = `${DATA_DIR}/runtime`;
const PID_FILE = `${RUNTIME_DIR}/gateway.pid`;
const DASHBOARD_PID_FILE = `${RUNTIME_DIR}/dashboard.pid`;
const DASHBOARD_PORT = parseInt(process.env.HERMES_DASHBOARD_PORT || "9119");

for (const d of [CONFIG_DIR, LOG_DIR, RUNTIME_DIR]) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

let gatewayProcess = null;
let dashboardProcess = null;
let installInProgress = false;

export function isGatewayRunning() {
  if (gatewayProcess && gatewayProcess.pid) {
    try {
      process.kill(gatewayProcess.pid, 0);
      return true;
    } catch {
      gatewayProcess = null;
    }
  }
  if (existsSync(PID_FILE)) {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim());
    if (pid && !isNaN(pid)) {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        try { unlinkSync(PID_FILE); } catch {}
      }
    }
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
    HERMES_DATA: DATA_DIR,
    HERMES_WORKSPACE: `${DATA_DIR}/workspace`,
    HERMES_CONFIG: CONFIG_DIR,
    HOME: `${DATA_DIR}/home`
  };
  gatewayProcess = Bun.spawn([HERMES_BIN, "gateway", "run"], { env, stdout: "pipe", stderr: "pipe", cwd: DATA_DIR });
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
    try {
      process.kill(dashboardProcess.pid, 0);
      return true;
    } catch {
      dashboardProcess = null;
    }
  }
  if (existsSync(DASHBOARD_PID_FILE)) {
    const pid = parseInt(readFileSync(DASHBOARD_PID_FILE, "utf-8").trim());
    if (pid && !isNaN(pid)) {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        try { unlinkSync(DASHBOARD_PID_FILE); } catch {}
      }
    }
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
  const logFile = `${LOG_DIR}/dashboard.log`;
  const env = {
    ...process.env,
    HERMES_HOME: `${DATA_DIR}/home`,
    HERMES_DATA: DATA_DIR,
    HERMES_WORKSPACE: `${DATA_DIR}/workspace`,
    HERMES_CONFIG: CONFIG_DIR,
    HOME: `${DATA_DIR}/home`,
    HERMES_DASHBOARD_INSECURE: "1"
  };
  dashboardProcess = Bun.spawn([
    HERMES_BIN, "dashboard", "--host", "0.0.0.0", "--port", String(DASHBOARD_PORT),
    "--insecure", "--skip-build", "--no-open"
  ], { env, stdout: "pipe", stderr: "pipe", cwd: DATA_DIR });
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
    broadcastLog("[install] Upgrading pip ...\n");
    const upgradeProc = Bun.spawn([pip, "install", "--upgrade", "pip", "wheel", "setuptools", "-q"], { stdout: "pipe", stderr: "pipe" });
    await upgradeProc.exited;
    broadcastLog(`[install] Installing ${packageSpec} ...\n`);
    const installProc = Bun.spawn([pip, "install", packageSpec, "-q"], { stdout: "pipe", stderr: "pipe" });
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
