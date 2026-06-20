// hermes/gateway.js
// Hermes Gateway 进程生命周期：启停、PID、运行时长
import { existsSync, readFileSync, writeFileSync, unlinkSync, chmodSync } from "fs";
import { broadcastLog } from "../logger.js";
import { swallowError } from "../error.js";
import { DATA_DIR, HERMES_BIN, PID_FILE } from "./paths.js";
import {
  isProcessAlive,
  processStartTimes,
  getProcessUptime,
  formatUptime,
} from "./proc-utils.js";

let gatewayProcess = null;

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

export function getGatewayUptime() {
  return formatUptime(getProcessUptime(getGatewayPid()));
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
  pipeStream(gatewayProcess.stdout, "[gateway] ", "gateway stdout reader");
  pipeStream(gatewayProcess.stderr, "[gateway] ", "gateway stderr reader");
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

// 内部：把子进程 stdout/stderr 转发到 broadcastLog
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
