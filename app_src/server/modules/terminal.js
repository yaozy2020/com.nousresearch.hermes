// @bun
// Web Terminal（ttyd 代理）
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";

const DATA_DIR = process.env.HERMES_DATA_DIR || "/var/apps/com.nousresearch.hermes/home/data";
const VENV_DIR = process.env.HERMES_VENV || `${DATA_DIR}/venv`;
const HERMES_BIN = process.env.HERMES_BIN || `${VENV_DIR}/bin/hermes`;
const CONFIG_DIR = `${DATA_DIR}/config`;
const RUNTIME_DIR = `${DATA_DIR}/runtime`;
const BIN_DIR = process.env.HERMES_PANEL_BIN || (process.env.TRIM_APPDEST ? `${process.env.TRIM_APPDEST}/bin` : "./bin");
const TTYD_BIN = `${BIN_DIR}/ttyd`;
const TERM_PORT = parseInt(process.env.HERMES_TERM_PORT || "9123");
const TERM_BIND = process.env.HERMES_TERM_BIND || "127.0.0.1";
const TERM_PID_FILE = `${RUNTIME_DIR}/ttyd.pid`;
const TERM_BASE_PATH = process.env.HERMES_TERM_BASE_PATH || "/terminal";

export const TERM_COMMANDS = {
  setup:   ["setup"],
  model:   ["model"],
  login:   ["login"],
  gateway: ["gateway", "setup"],
  doctor:  ["doctor"],
  status:  ["status"]
};

let ttydProcess = null;

export function isTtydAlive() {
  if (ttydProcess && ttydProcess.pid) {
    try { process.kill(ttydProcess.pid, 0); return true; }
    catch { ttydProcess = null; }
  }
  if (existsSync(TERM_PID_FILE)) {
    const pid = parseInt(readFileSync(TERM_PID_FILE, "utf-8").trim());
    if (pid && !isNaN(pid)) {
      try { process.kill(pid, 0); return true; }
      catch { try { unlinkSync(TERM_PID_FILE); } catch {} }
    }
  }
  return false;
}

export function getTtydPid() {
  if (ttydProcess?.pid) return ttydProcess.pid;
  if (existsSync(TERM_PID_FILE)) {
    return parseInt(readFileSync(TERM_PID_FILE, "utf-8").trim()) || null;
  }
  return null;
}

export async function stopTtyd() {
  const pid = getTtydPid();
  if (pid) {
    try { process.kill(pid, "SIGTERM"); } catch {}
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try { process.kill(pid, 0); } catch { break; }
    }
    try { process.kill(pid, "SIGKILL"); } catch {}
  }
  ttydProcess = null;
  try { unlinkSync(TERM_PID_FILE); } catch {}
  return { ok: true };
}

export async function startTtyd(cmdKey, options = {}) {
  const { mobile = false } = options;
  const cmdArgs = TERM_COMMANDS[cmdKey];
  if (!cmdArgs) return { ok: false, error: `unknown command: ${cmdKey}` };
  if (!existsSync(TTYD_BIN)) return { ok: false, error: `ttyd not found at ${TTYD_BIN}` };
  if (!existsSync(HERMES_BIN)) return { ok: false, error: "hermes binary not found. Install hermes first." };
  // 一次只允许一个终端
  await stopTtyd();
  const fontSize = mobile ? 16 : 14;
  const env = {
    ...process.env,
    HERMES_HOME:      `${DATA_DIR}/home`,
    HERMES_DATA:      DATA_DIR,
    HERMES_WORKSPACE: `${DATA_DIR}/workspace`,
    HERMES_CONFIG:    CONFIG_DIR,
    HOME:             `${DATA_DIR}/home`,
    PATH:             `${VENV_DIR}/bin:${process.env.PATH}`,
    TERM:             "xterm-256color"
  };
  ttydProcess = Bun.spawn([
    TTYD_BIN,
    "-p", String(TERM_PORT),
    "-i", TERM_BIND,
    "-b", TERM_BASE_PATH,
    "-W",
    "-O",
    "-t", `fontSize=${fontSize}`,
    "-t", "theme={\"background\":\"#0d1117\",\"foreground\":\"#c9d1d9\"}",
    "--once",
    HERMES_BIN,
    ...cmdArgs
  ], { env, stdout: "pipe", stderr: "pipe", cwd: DATA_DIR });
  if (!ttydProcess?.pid) return { ok: false, error: "spawn failed" };
  writeFileSync(TERM_PID_FILE, String(ttydProcess.pid));
  // Drain stdout/stderr to log so it doesn't block
  (async () => {
    try {
      const r = ttydProcess.stdout.getReader();
      while (true) { const { done } = await r.read(); if (done) break; }
    } catch {}
  })();
  await new Promise((r) => setTimeout(r, 600));
  return {
    ok: true,
    cmd: cmdKey,
    args: ["hermes", ...cmdArgs],
    port: TERM_PORT,
    pid: ttydProcess.pid,
    mobile,
    base_path: TERM_BASE_PATH,
    url_hint: `${TERM_BASE_PATH}/`
  };
}

export function getTtydTargetUrl(suffix = "/") {
  if (!isTtydAlive()) return null;
  const safe = (suffix || "/").replace(/^\/+/, "/");
  return `http://127.0.0.1:${TERM_PORT}${TERM_BASE_PATH}${safe}`;
}
