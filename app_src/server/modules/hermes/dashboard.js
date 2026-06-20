// hermes/dashboard.js
// Hermes Dashboard 进程生命周期
import { existsSync, readFileSync, writeFileSync, unlinkSync, chmodSync } from "fs";
import { broadcastLog } from "../logger.js";
import { swallowError } from "../error.js";
import { DATA_DIR, HERMES_BIN, DASHBOARD_PID_FILE } from "./paths.js";
import {
  isProcessAlive,
  isPortInUse,
  processStartTimes,
  getProcessUptime,
  formatUptime,
} from "./proc-utils.js";
import { readDashboardEnv } from "./dashboard-env.js";

let dashboardProcess = null;

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

export function getDashboardUptime() {
  return formatUptime(getProcessUptime(getDashboardPid()));
}

export async function startDashboard() {
  // 每次启动前从 .env 重新读取端口和访问模式
  const { port, insecure } = readDashboardEnv();
  if (isDashboardRunning()) return { ok: true, message: "already running", pid: getDashboardPid(), port };
  if (!existsSync(HERMES_BIN)) return { ok: false, error: "hermes not installed yet" };

  const env = {
    ...process.env,
    HERMES_DASHBOARD_PORT: String(port),
    HERMES_DASHBOARD_INSECURE: insecure ? "1" : "0",
    HERMES_HOME: `${DATA_DIR}/home`,
    HOME: `${DATA_DIR}/home`
  };
  // NAS 内网默认允许局域网访问 Dashboard；HERMES_DASHBOARD_INSECURE=0 锁回本地
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
  pipeStream(dashboardProcess.stdout, "[dashboard] ", "dashboard stdout reader");
  pipeStream(dashboardProcess.stderr, "[dashboard] ", "dashboard stderr reader");
  return { ok: true, message: "started", pid: dashboardProcess.pid, port };
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

function pipeStream(stream, prefix, swallowKey) {
  (async () => {
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = new TextDecoder().decode(value);
        broadcastLog(prefix + text);
      }
    } catch (err) {
      swallowError(swallowKey, err);
    }
  })();
}
