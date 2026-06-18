// @bun
// app_src/server/index.js
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, chmodSync } from "fs";
import { join, extname, normalize } from "path";
var DATA_DIR = process.env.HERMES_DATA_DIR || "/var/apps/com.nousresearch.hermes/home/data";
var STATIC_DIR = process.env.STATIC_DIR || "./ui";
var SOCKET_PATH = process.env.SOCKET_PATH || "/tmp/hermes.sock";
var VENV_DIR = process.env.HERMES_VENV || `${DATA_DIR}/venv`;
var HERMES_BIN = process.env.HERMES_BIN || `${VENV_DIR}/bin/hermes`;
var CONFIG_DIR = `${DATA_DIR}/config`;
var LOG_DIR = `${DATA_DIR}/logs`;
var PID_FILE = `${DATA_DIR}/runtime/gateway.pid`;
var DASHBOARD_PID_FILE = `${DATA_DIR}/runtime/dashboard.pid`;
var RUNTIME_DIR = `${DATA_DIR}/runtime`;
var DASHBOARD_PORT = parseInt(process.env.HERMES_DASHBOARD_PORT || "9119");
// ── ttyd / terminal (v0.20.4) ───────────────────────────────────────
var BIN_DIR = process.env.HERMES_PANEL_BIN || (process.env.TRIM_APPDEST ? `${process.env.TRIM_APPDEST}/bin` : "./bin");
var TTYD_BIN = `${BIN_DIR}/ttyd`;
var TERM_PORT = parseInt(process.env.HERMES_TERM_PORT || "9123");
// ttyd 监听 0.0.0.0，跟 Dashboard 9119 同一玩法（受 fnOS 应用网关保护）
var TERM_BIND = process.env.HERMES_TERM_BIND || "0.0.0.0";
var TERM_PID_FILE = `${RUNTIME_DIR}/ttyd.pid`;
var ttydProcess = null;
for (const d of [CONFIG_DIR, LOG_DIR, RUNTIME_DIR]) {
  if (!existsSync(d))
    mkdirSync(d, { recursive: true });
}
var gatewayProcess = null;
function isGatewayRunning() {
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
        try {
          unlinkSync(PID_FILE);
        } catch {}
      }
    }
  }
  return false;
}
function getGatewayPid() {
  if (gatewayProcess?.pid)
    return gatewayProcess.pid;
  if (existsSync(PID_FILE)) {
    return parseInt(readFileSync(PID_FILE, "utf-8").trim()) || null;
  }
  return null;
}
async function startGateway() {
  if (isGatewayRunning())
    return { ok: true, message: "already running", pid: getGatewayPid() };
  if (!existsSync(HERMES_BIN))
    return { ok: false, error: "hermes binary not found. Reinstall the app." };
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
  gatewayProcess = Bun.spawn([HERMES_BIN, "gateway", "run"], {
    env,
    stdout: "pipe",
    stderr: "pipe",
    cwd: DATA_DIR
  });
  writeFileSync(PID_FILE, String(gatewayProcess.pid));
  (async () => {
    const reader = gatewayProcess.stdout.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done)
          break;
        const text = new TextDecoder().decode(value);
        Bun.write(logFile, text, { append: true }).catch(() => {});
        broadcastLog(text);
      }
    } catch {}
  })();
  (async () => {
    const reader = gatewayProcess.stderr.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done)
          break;
        const text = new TextDecoder().decode(value);
        Bun.write(logFile, text, { append: true }).catch(() => {});
        broadcastLog(text);
      }
    } catch {}
  })();
  return { ok: true, message: "started", pid: gatewayProcess.pid };
}
async function stopGateway() {
  if (!isGatewayRunning())
    return { ok: true, message: "not running" };
  const pid = getGatewayPid();
  if (pid) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
    for (let i = 0;i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        process.kill(pid, 0);
      } catch {
        break;
      }
    }
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
  gatewayProcess = null;
  try {
    unlinkSync(PID_FILE);
  } catch {}
  return { ok: true, message: "stopped" };
}
function readConfig() {
  const configPath = `${CONFIG_DIR}/config.yaml`;
  const envPath = `${CONFIG_DIR}/.env`;
  const config = { yaml: "", env: "", exists: false };
  if (existsSync(configPath)) {
    config.yaml = readFileSync(configPath, "utf-8");
    config.exists = true;
  }
  if (existsSync(envPath)) {
    config.env = readFileSync(envPath, "utf-8");
  }
  return config;
}
function writeConfig(yaml, env) {
  if (yaml !== undefined)
    writeFileSync(`${CONFIG_DIR}/config.yaml`, yaml);
  if (env !== undefined)
    writeFileSync(`${CONFIG_DIR}/.env`, env);
  return { ok: true };
}

// ─── Channels (.env 字段管理) ───
// 仅暴露"纯 .env 写入即生效"的频道字段；其他频道引导用户进 Hermes Web UI
var CHANNEL_FIELDS = {
  telegram: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_ALLOWED_USERS", "TELEGRAM_HOME_CHANNEL"],
  slack:    ["SLACK_BOT_TOKEN", "SLACK_HOME_CHANNEL"],
  discord:  ["DISCORD_BOT_TOKEN", "DISCORD_HOME_CHANNEL"],
  qqbot:    ["QQ_APP_ID", "QQBOT_TOKEN", "QQBOT_HOME_CHANNEL"],
  wecom:    ["WECOM_BOT_ID", "WECOM_HOME_CHANNEL"]
};
function parseEnvText(text) {
  const map = {};
  if (!text) return map;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    map[k] = v;
  }
  return map;
}
function serializeEnv(map) {
  return Object.entries(map)
    .filter(([_, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n";
}
function readChannels() {
  const envPath = `${CONFIG_DIR}/.env`;
  const text = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  const env = parseEnvText(text);
  const out = {};
  for (const [chan, fields] of Object.entries(CHANNEL_FIELDS)) {
    out[chan] = {};
    let configured = false;
    for (const f of fields) {
      out[chan][f] = env[f] || "";
      if (env[f]) configured = true;
    }
    out[chan]._configured = configured;
  }
  return out;
}
function writeChannel(name, values) {
  if (!CHANNEL_FIELDS[name]) {
    return { ok: false, error: `unknown channel: ${name}` };
  }
  const envPath = `${CONFIG_DIR}/.env`;
  const text = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  const env = parseEnvText(text);
  const fields = CHANNEL_FIELDS[name];
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(values, f)) {
      const v = values[f];
      if (v === "" || v === null || v === undefined) {
        delete env[f];
      } else {
        env[f] = String(v);
      }
    }
  }
  writeFileSync(envPath, serializeEnv(env));
  return { ok: true, channel: name, configured: fields.some((f) => env[f]) };
}
function deleteChannel(name) {
  if (!CHANNEL_FIELDS[name]) {
    return { ok: false, error: `unknown channel: ${name}` };
  }
  const envPath = `${CONFIG_DIR}/.env`;
  const text = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  const env = parseEnvText(text);
  for (const f of CHANNEL_FIELDS[name]) delete env[f];
  writeFileSync(envPath, serializeEnv(env));
  return { ok: true, channel: name };
}
function readLogs(lines = 200) {
  const logFile = `${LOG_DIR}/gateway.log`;
  if (!existsSync(logFile))
    return { lines: [] };
  const content = readFileSync(logFile, "utf-8");
  const allLines = content.split(`
`);
  return { lines: allLines.slice(-lines) };
}
var wsClients = new Set;
function broadcastLog(text) {
  const msg = JSON.stringify({ type: "log", data: text });
  for (const ws of wsClients) {
    try {
      ws.send(msg);
    } catch {
      wsClients.delete(ws);
    }
  }
}
var installInProgress = false;
var dashboardProcess = null;
function isDashboardRunning() {
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
        try {
          unlinkSync(DASHBOARD_PID_FILE);
        } catch {}
      }
    }
  }
  return false;
}
function getDashboardPid() {
  if (dashboardProcess?.pid)
    return dashboardProcess.pid;
  if (existsSync(DASHBOARD_PID_FILE)) {
    return parseInt(readFileSync(DASHBOARD_PID_FILE, "utf-8").trim()) || null;
  }
  return null;
}
async function startDashboard() {
  if (isDashboardRunning())
    return { ok: true, message: "already running", pid: getDashboardPid(), port: DASHBOARD_PORT };
  if (!existsSync(HERMES_BIN))
    return { ok: false, error: "hermes not installed yet" };
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
    HERMES_BIN,
    "dashboard",
    "--host",
    "0.0.0.0",
    "--port",
    String(DASHBOARD_PORT),
    "--insecure",
    "--skip-build",
    "--no-open"
  ], { env, stdout: "pipe", stderr: "pipe", cwd: DATA_DIR });
  writeFileSync(DASHBOARD_PID_FILE, String(dashboardProcess.pid));
  (async () => {
    const reader = dashboardProcess.stdout.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done)
          break;
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
        if (done)
          break;
        const text = new TextDecoder().decode(value);
        Bun.write(logFile, text, { append: true }).catch(() => {});
        broadcastLog("[dashboard] " + text);
      }
    } catch {}
  })();
  return { ok: true, message: "started", pid: dashboardProcess.pid, port: DASHBOARD_PORT };
}
async function stopDashboard() {
  if (!isDashboardRunning())
    return { ok: true, message: "not running" };
  const pid = getDashboardPid();
  if (pid) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
    for (let i = 0;i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        process.kill(pid, 0);
      } catch {
        break;
      }
    }
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
  try {
    const stopProc = Bun.spawn([HERMES_BIN, "dashboard", "--stop"], { stdout: "pipe", stderr: "pipe" });
    await stopProc.exited;
  } catch {}
  dashboardProcess = null;
  try {
    unlinkSync(DASHBOARD_PID_FILE);
  } catch {}
  return { ok: true, message: "stopped" };
}
async function installHermes(packageSpec) {
  if (installInProgress)
    return { ok: false, error: "Installation already in progress" };
  if (existsSync(HERMES_BIN))
    return { ok: true, message: "already installed", bin: HERMES_BIN };
  installInProgress = true;
  broadcastLog(`[install] Starting Hermes installation ...
`);
  try {
    let pythonBin = null;
    for (const py of ["python3.12", "python3.11", "python3.10", "python3"]) {
      try {
        const proc = Bun.spawn([py, "--version"], { stdout: "pipe", stderr: "pipe" });
        const exitCode2 = await proc.exited;
        if (exitCode2 === 0) {
          pythonBin = py;
          break;
        }
      } catch {}
    }
    if (!pythonBin) {
      installInProgress = false;
      return { ok: false, error: "Python 3.10+ not found" };
    }
    broadcastLog(`[install] Using ${pythonBin}
`);
    if (!existsSync(`${VENV_DIR}/bin/python`)) {
      broadcastLog(`[install] Creating virtualenv ...
`);
      const venvProc = Bun.spawn([pythonBin, "-m", "venv", VENV_DIR], { stdout: "pipe", stderr: "pipe" });
      await venvProc.exited;
    }
    const pip = `${VENV_DIR}/bin/pip`;
    broadcastLog(`[install] Upgrading pip ...
`);
    const upgradeProc = Bun.spawn([pip, "install", "--upgrade", "pip", "wheel", "setuptools", "-q"], { stdout: "pipe", stderr: "pipe" });
    await upgradeProc.exited;
    broadcastLog(`[install] Installing ${packageSpec} ...
`);
    const installProc = Bun.spawn([pip, "install", packageSpec, "-q"], { stdout: "pipe", stderr: "pipe" });
    (async () => {
      const reader = installProc.stderr.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done)
            break;
          broadcastLog(new TextDecoder().decode(value));
        }
      } catch {}
    })();
    const exitCode = await installProc.exited;
    if (exitCode !== 0) {
      broadcastLog(`[install] pip install failed (exit ${exitCode}), trying GitHub source ...
`);
      const ghProc = Bun.spawn([pip, "install", `git+https://github.com/NousResearch/hermes.git`, "-q"], { stdout: "pipe", stderr: "pipe" });
      const ghExit = await ghProc.exited;
      if (ghExit !== 0) {
        installInProgress = false;
        broadcastLog(`[install] ERROR: All installation methods failed
`);
        return { ok: false, error: `Installation failed. pip exit=${exitCode}, github exit=${ghExit}` };
      }
    }
    broadcastLog(`[install] Hermes installed successfully!
`);
    installInProgress = false;
    return { ok: true, message: "installed", bin: HERMES_BIN };
  } catch (e) {
    installInProgress = false;
    broadcastLog(`[install] ERROR: ${e.message}
`);
    return { ok: false, error: e.message };
  }
}
// ─── Panel version: 运行时从 manifest 读取，避免硬编码穿帮 ───
function readPanelVersion() {
  const candidates = [
    process.env.MANIFEST_PATH,
    process.env.TRIM_APPDEST ? join(process.env.TRIM_APPDEST, "..", "manifest") : null,
    "/var/apps/com.nousresearch.hermes/manifest"
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      const txt = readFileSync(p, "utf-8");
      const m = txt.match(/^\s*version\s*=\s*(\S+)/m);
      if (m) return m[1];
    } catch {}
  }
  return "unknown";
}
const PANEL_VERSION = readPanelVersion();

// ─── Agent version: 真实从 venv 读，没装就显示 not_installed ───
function readAgentVersion() {
  if (!existsSync(HERMES_BIN)) return null;
  try {
    const proc = Bun.spawnSync([HERMES_BIN, "--version"], { stdout: "pipe", stderr: "pipe" });
    const out = (proc.stdout?.toString() || "") + (proc.stderr?.toString() || "");
    const m = out.match(/(\d+\.\d+\.\d+[\w.-]*)/);
    if (m) return m[1];
  } catch {}
  return "unknown";
}

function getVersion() {
  const agentVer = readAgentVersion();
  return {
    panel: PANEL_VERSION,
    agent: agentVer === null ? "not_installed" : agentVer,
    agent_installed: agentVer !== null,
    // 兼容旧字段（前端可能在用）
    hermes: agentVer === null ? "not_installed" : agentVer,
    venv: VENV_DIR,
    dataDir: DATA_DIR
  };
}
var MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};
function serveStatic(pathname) {
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(STATIC_DIR, safe);
  if (!existsSync(filePath) || !extname(filePath)) {
    filePath = join(STATIC_DIR, "index.html");
  }
  if (!existsSync(filePath)) {
    return new Response("Not Found", { status: 404 });
  }
  const mime = MIME[extname(filePath)] || "application/octet-stream";
  return new Response(Bun.file(filePath), { headers: { "Content-Type": mime } });
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
async function parseBody(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

// ─── Terminal (ttyd) — v0.20.4 ─────────────────────────────────────
// 仅在控制面板内嵌一个 hermes setup 终端，监听 127.0.0.1:9123。
// 命令白名单，禁止任意命令执行。
var TERM_COMMANDS = {
  setup:    ["setup"],
  model:    ["model"],
  login:    ["login"],
  gateway:  ["gateway", "setup"],
  doctor:   ["doctor"],
  status:   ["status"]
};
function isTtydAlive() {
  if (ttydProcess && ttydProcess.pid) {
    try { process.kill(ttydProcess.pid, 0); return true; } catch { ttydProcess = null; }
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
function getTtydPid() {
  if (ttydProcess?.pid) return ttydProcess.pid;
  if (existsSync(TERM_PID_FILE)) {
    return parseInt(readFileSync(TERM_PID_FILE, "utf-8").trim()) || null;
  }
  return null;
}
async function stopTtyd() {
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
async function startTtyd(cmdKey) {
  const cmdArgs = TERM_COMMANDS[cmdKey];
  if (!cmdArgs) return { ok: false, error: `unknown command: ${cmdKey}` };
  if (!existsSync(TTYD_BIN))    return { ok: false, error: `ttyd not found at ${TTYD_BIN}` };
  if (!existsSync(HERMES_BIN))  return { ok: false, error: "hermes binary not found. Install hermes first." };
  // Always stop previous session first (一次只允许一个终端)
  await stopTtyd();
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
  // ttyd args:
  //   -p <port>     listen port
  //   -i <iface>    bind interface (lo only)
  //   -W            writable
  //   -O            check origin disabled (we proxy through panel socket)
  //   -t            terminal options
  //   --once        exit after first client disconnects
  ttydProcess = Bun.spawn([
    TTYD_BIN,
    "-p", String(TERM_PORT),
    "-i", TERM_BIND,
    "-W",
    "-O",
    "-t", "fontSize=14",
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
  // Give ttyd ~600ms to bind
  await new Promise((r) => setTimeout(r, 600));
  return {
    ok: true,
    cmd: cmdKey,
    args: ["hermes", ...cmdArgs],
    port: TERM_PORT,
    pid: ttydProcess.pid,
    // 前端用 location.hostname + 这个 port 拼出 ttyd 入口
    url_hint: `http://<host>:${TERM_PORT}/`
  };
}
async function proxyTerminal(req, suffix) {
  if (!isTtydAlive()) {
    return new Response("Terminal not started. POST /api/terminal/start first.", { status: 503 });
  }
  // ttyd 直接监听公开端口（同 Dashboard 9119 模式），这里仅返回 302 跳转到 ttyd 首页。
  // 调用方应优先通过 startTtyd 返回的 url + port 直接访问 ttyd。
  return new Response(null, { status: 302, headers: { Location: `http://${req.headers.get('host')?.split(':')[0] || 'localhost'}:${TERM_PORT}${suffix || '/'}` } });
}

// ─── Hermes 一键重启（Gateway + Dashboard 全停全起） — v0.20.4 ──
async function restartHermesAll() {
  const result = { gateway: null, dashboard: null };
  // Snapshot 当前在跑的进程，重启后恢复同样的进程
  const wasGw = isGatewayRunning();
  const wasDb = isDashboardRunning();
  // 全停
  result.gateway = await stopGateway();
  result.dashboard = await stopDashboard();
  // 让端口释放
  await new Promise((r) => setTimeout(r, 800));
  // 全启（只启动重启前在跑的；都没跑就只起 gateway 默认）
  if (wasGw || (!wasGw && !wasDb)) {
    result.gateway = await startGateway();
  }
  if (wasDb) {
    result.dashboard = await startDashboard();
  }
  return {
    ok: true,
    message: "hermes restarted",
    restarted: { gateway: wasGw || (!wasGw && !wasDb), dashboard: wasDb },
    detail: result
  };
}

async function handleRequest(req) {
  const url = new URL(req.url);
  let pathname = url.pathname;
  const method = req.method;
  const GATEWAY_PREFIX = "/app/com-nousresearch-hermes";
  if (pathname.startsWith(GATEWAY_PREFIX)) {
    pathname = pathname.slice(GATEWAY_PREFIX.length) || "/";
  }
  if (pathname.startsWith("/api/")) {
    if (pathname === "/api/health" && method === "GET") {
      return json({ ok: true, ts: Date.now() });
    }
    if (pathname === "/api/status" && method === "GET") {
      return json({
        running: isGatewayRunning(),
        pid: getGatewayPid(),
        version: getVersion()
      });
    }
    if (pathname === "/api/gateway/start" && method === "POST") {
      const result = await startGateway();
      return json(result, result.ok ? 200 : 500);
    }
    if (pathname === "/api/gateway/stop" && method === "POST") {
      const result = await stopGateway();
      return json(result);
    }
    if (pathname === "/api/gateway/restart" && method === "POST") {
      await stopGateway();
      await new Promise((r) => setTimeout(r, 1500));
      const result = await startGateway();
      return json(result, result.ok ? 200 : 500);
    }
    if (pathname === "/api/config" && method === "GET") {
      return json(readConfig());
    }
    if (pathname === "/api/config" && method === "POST") {
      const body = await parseBody(req);
      const result = writeConfig(body.yaml, body.env);
      return json(result);
    }
    if (pathname === "/api/logs" && method === "GET") {
      const lines = parseInt(url.searchParams.get("lines") || "200");
      return json(readLogs(lines));
    }
    if (pathname === "/api/channels" && method === "GET") {
      return json({ ok: true, channels: readChannels(), supported: Object.keys(CHANNEL_FIELDS) });
    }
    {
      const m = pathname.match(/^\/api\/channels\/([a-z0-9_-]+)$/);
      if (m) {
        const chanName = m[1];
        if (method === "POST" || method === "PUT") {
          const body = await parseBody(req);
          const result = writeChannel(chanName, body || {});
          return json(result, result.ok ? 200 : 400);
        }
        if (method === "DELETE") {
          const result = deleteChannel(chanName);
          return json(result, result.ok ? 200 : 400);
        }
      }
    }
    if (pathname === "/api/version" && method === "GET") {
      return json(getVersion());
    }
    if (pathname === "/api/hermes/status" && method === "GET") {
      return json({
        installed: existsSync(HERMES_BIN),
        venv: VENV_DIR,
        bin: HERMES_BIN
      });
    }
    if (pathname === "/api/hermes/install" && method === "POST") {
      const body = await parseBody(req);
      const packageSpec = body.package || "hermes-agent";
      const result = await installHermes(packageSpec);
      return json(result, result.ok ? 200 : 500);
    }
    if (pathname === "/api/dashboard/status" && method === "GET") {
      return json({
        running: isDashboardRunning(),
        pid: getDashboardPid(),
        port: DASHBOARD_PORT
      });
    }
    if (pathname === "/api/dashboard/start" && method === "POST") {
      const result = await startDashboard();
      return json(result, result.ok ? 200 : 500);
    }
    if (pathname === "/api/dashboard/stop" && method === "POST") {
      const result = await stopDashboard();
      return json(result);
    }
    if (pathname === "/api/dashboard/restart" && method === "POST") {
      await stopDashboard();
      await new Promise((r) => setTimeout(r, 1500));
      const result = await startDashboard();
      return json(result, result.ok ? 200 : 500);
    }
    // ── Hermes 一键全重启（v0.20.4） ──
    if (pathname === "/api/hermes/restart" && method === "POST") {
      const result = await restartHermesAll();
      return json(result);
    }
    if (pathname === "/api/hermes/stop_all" && method === "POST") {
      const gw = await stopGateway();
      const db = await stopDashboard();
      return json({ ok: true, gateway: gw, dashboard: db });
    }
    // ── Terminal (ttyd, v0.20.4) ──
    if (pathname === "/api/terminal/status" && method === "GET") {
      return json({
        running: isTtydAlive(),
        pid: getTtydPid(),
        port: TERM_PORT,
        ttyd_available: existsSync(TTYD_BIN),
        commands: Object.keys(TERM_COMMANDS)
      });
    }
    if (pathname === "/api/terminal/start" && method === "POST") {
      const body = await parseBody(req);
      const cmd = (body && body.cmd) || "setup";
      const result = await startTtyd(cmd);
      return json(result, result.ok ? 200 : 500);
    }
    if (pathname === "/api/terminal/stop" && method === "POST") {
      const result = await stopTtyd();
      return json(result);
    }
    return json({ error: "not found" }, 404);
  }
  // ── /terminal/* 反代到 ttyd (v0.20.4) ──
  if (pathname === "/terminal" || pathname.startsWith("/terminal/")) {
    const suffix = pathname.replace(/^\/terminal/, "") || "/";
    return proxyTerminal(req, suffix + (url.search || ""));
  }
  return serveStatic(pathname);
}
var server = Bun.serve({
  unix: SOCKET_PATH,
  async fetch(req, server2) {
    const url = new URL(req.url);
    if (url.pathname === "/api/logs/stream" && server2) {
      if (server2.upgrade(req))
        return;
    }
    return handleRequest(req);
  },
  websocket: {
    open(ws) {
      wsClients.add(ws);
    },
    message(ws) {},
    close(ws) {
      wsClients.delete(ws);
    }
  },
  error(err) {
    console.error("Server error:", err);
    return new Response("Internal Error", { status: 500 });
  }
});
try {
  chmodSync(SOCKET_PATH, 0o660);
} catch {}
console.log(`[Hermes Panel] Listening on socket: ${SOCKET_PATH}`);
console.log(`[Hermes Panel] Static dir: ${STATIC_DIR}`);
console.log(`[Hermes Panel] Data dir: ${DATA_DIR}`);
console.log(`[Hermes Panel] Hermes bin: ${HERMES_BIN}`);
