// @bun
// Web Terminal（ttyd 代理）
import { existsSync, readFileSync, writeFileSync, unlinkSync, appendFileSync, chmodSync } from "fs";
import { createServer } from "net";

const DATA_DIR = process.env.HERMES_DATA_DIR || "/var/apps/com.nousresearch.hermes/home/data";
const VENV_DIR = process.env.HERMES_VENV || `${DATA_DIR}/venv`;
const HERMES_BIN = process.env.HERMES_BIN || `${VENV_DIR}/bin/hermes`;
const CONFIG_DIR = `${DATA_DIR}/config`;
const RUNTIME_DIR = `${DATA_DIR}/runtime`;
const BIN_DIR = process.env.HERMES_PANEL_BIN || (process.env.TRIM_APPDEST ? `${process.env.TRIM_APPDEST}/bin` : "./bin");
const SERVER_DIR = process.env.TRIM_APPDEST ? `${process.env.TRIM_APPDEST}/server/modules` : `${import.meta.dir}`;
const TTYD_BIN = `${BIN_DIR}/ttyd`;
const SHELL_SCRIPT = `${SERVER_DIR}/terminal-shell.js`;
const TERM_PORT_PREFERRED = parseInt(process.env.HERMES_TERM_PORT || "9123");
const TERM_BIND = process.env.HERMES_TERM_BIND || "127.0.0.1";
const TERM_PID_FILE = `${RUNTIME_DIR}/ttyd.pid`;
const TERM_INFO_FILE = `${RUNTIME_DIR}/ttyd-info.json`;
const TERM_BASE_PATH = process.env.HERMES_TERM_BASE_PATH || "/ttyd";
const TERM_LOG_FILE = `${RUNTIME_DIR}/ttyd.log`;

export const TERM_COMMANDS = {
  setup:   ["setup"],
  model:   ["model"],
  login:   ["login"],
  gateway: ["gateway", "setup"],
  doctor:  ["doctor"],
  status:  ["status"]
};

let ttydProcess = null;
let currentTtydPort = null;

function logTtyd(line) {
  try { appendFileSync(TERM_LOG_FILE, `${new Date().toISOString()} ${line}\n`); } catch {}
}

function readTtydInfo() {
  try {
    if (existsSync(TERM_INFO_FILE)) {
      return JSON.parse(readFileSync(TERM_INFO_FILE, "utf-8"));
    }
  } catch {}
  return null;
}

function writeTtydInfo(pid, port) {
  try {
    writeFileSync(TERM_INFO_FILE, JSON.stringify({ pid, port, started: new Date().toISOString() }));
    chmodSync(TERM_INFO_FILE, 0o640);
  } catch {}
}

function clearTtydInfo() {
  ttydProcess = null;
  currentTtydPort = null;
  try { unlinkSync(TERM_INFO_FILE); } catch {}
  try { unlinkSync(TERM_PID_FILE); } catch {}
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") resolve(true);
      else resolve(false);
    });
    server.once("listening", () => {
      server.close(() => resolve(false));
    });
    server.listen(port, TERM_BIND);
  });
}

async function findFreePort(preferred, tries = 20) {
  if (!(await isPortInUse(preferred))) return preferred;
  for (let i = 0; i < tries; i++) {
    const port = preferred + 1 + i;
    if (!(await isPortInUse(port))) return port;
  }
  return null;
}

export function isTtydAlive() {
  if (ttydProcess && ttydProcess.pid) {
    try { process.kill(ttydProcess.pid, 0); return true; }
    catch { ttydProcess = null; }
  }
  const info = readTtydInfo();
  if (info?.pid) {
    try { process.kill(info.pid, 0); return true; }
    catch { clearTtydInfo(); }
  }
  if (existsSync(TERM_PID_FILE)) {
    const pid = parseInt(readFileSync(TERM_PID_FILE, "utf-8").trim());
    if (pid && !isNaN(pid)) {
      try { process.kill(pid, 0); return true; }
      catch { clearTtydInfo(); }
    }
  }
  return false;
}

export function getTtydPid() {
  if (ttydProcess?.pid) return ttydProcess.pid;
  const info = readTtydInfo();
  if (info?.pid) return info.pid;
  if (existsSync(TERM_PID_FILE)) {
    return parseInt(readFileSync(TERM_PID_FILE, "utf-8").trim()) || null;
  }
  return null;
}

function formatUptime(seconds) {
  if (!seconds || seconds < 0) return null;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}天${h}小时${m}分`;
  if (h > 0) return `${h}小时${m}分${s}秒`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

export function getTtydUptime() {
  const info = readTtydInfo();
  if (info?.started) {
    const started = new Date(info.started).getTime();
    if (!isNaN(started)) return formatUptime((Date.now() - started) / 1000);
  }
  return null;
}

export function getTtydPort() {
  if (currentTtydPort) return currentTtydPort;
  const info = readTtydInfo();
  if (info?.port) return info.port;
  return TERM_PORT_PREFERRED;
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
  clearTtydInfo();
  return { ok: true };
}

export async function startTtyd(cmdKey, options = {}) {
  const { mobile = false } = options;
  const cmdArgs = TERM_COMMANDS[cmdKey];
  if (!cmdArgs) return { ok: false, error: `unknown command: ${cmdKey}` };
  if (!existsSync(TTYD_BIN)) return { ok: false, error: `ttyd not found at ${TTYD_BIN}` };
  if (!existsSync(HERMES_BIN)) return { ok: false, error: "hermes binary not found. Install hermes first." };

  await stopTtyd();

  const port = await findFreePort(TERM_PORT_PREFERRED);
  if (!port) return { ok: false, error: "无法找到可用端口（已尝试 9123~9143）" };
  currentTtydPort = port;

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

  logTtyd(`starting ttyd on ${TERM_BIND}:${port} for hermes ${cmdArgs.join(" ")}`);

  // 安全：通过受限 shell 包装器启动 hermes，禁止任意命令注入
  const shellArgs = [SHELL_SCRIPT, "hermes", ...cmdArgs];
  ttydProcess = Bun.spawn([
    TTYD_BIN,
    "-p", String(port),
    "-i", TERM_BIND,
    "-b", TERM_BASE_PATH,
    "-W",
    "-t", `fontSize=${fontSize}`,
    "-t", "theme={\"background\":\"#0d1117\",\"foreground\":\"#c9d1d9\"}",
    "bun",
    ...shellArgs
  ], { env, stdout: "pipe", stderr: "pipe", cwd: DATA_DIR });

  if (!ttydProcess?.pid) {
    currentTtydPort = null;
    return { ok: false, error: "spawn failed" };
  }

  writeFileSync(TERM_PID_FILE, String(ttydProcess.pid));
  try { chmodSync(TERM_PID_FILE, 0o640); } catch {}
  writeTtydInfo(ttydProcess.pid, port);

  // 收集 stdout/stderr 到日志，便于排查
  (async () => {
    try {
      const r = ttydProcess.stdout.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await r.read();
        if (done) break;
        logTtyd(`[stdout] ${decoder.decode(value, { stream: true })}`);
      }
    } catch {}
  })();
  (async () => {
    try {
      const r = ttydProcess.stderr.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await r.read();
        if (done) break;
        logTtyd(`[stderr] ${decoder.decode(value, { stream: true })}`);
      }
    } catch {}
  })();

  // 等 ttyd 监听成功
  await new Promise((r) => setTimeout(r, 600));

  // 验证是否真的起来了
  if (!isTtydAlive()) {
    const log = existsSync(TERM_LOG_FILE) ? readFileSync(TERM_LOG_FILE, "utf-8").split("\n").slice(-10).join("\n") : "";
    return { ok: false, error: `ttyd 启动后未存活，可能端口被占或命令异常。日志：${log || "无"}` };
  }

  return {
    ok: true,
    cmd: cmdKey,
    args: ["hermes", ...cmdArgs],
    port,
    pid: ttydProcess.pid,
    mobile,
    base_path: TERM_BASE_PATH,
    url_hint: `${TERM_BASE_PATH}/`
  };
}

export function getTtydTargetUrl(suffix = "/") {
  if (!isTtydAlive()) return null;
  const port = getTtydPort();
  const safe = (suffix || "/").replace(/^\/+/, "/");
  return `http://${TERM_BIND}:${port}${TERM_BASE_PATH}${safe}`;
}
