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
function getVersion() {
  const versionFile = `${CONFIG_DIR}/../install/version.txt`;
  let installed = "unknown";
  try {
    if (existsSync(versionFile))
      installed = readFileSync(versionFile, "utf-8").trim();
  } catch {}
  return {
    panel: "0.19.0",
    hermes: installed,
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
    return json({ error: "not found" }, 404);
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
  chmodSync(SOCKET_PATH, 511);
} catch {}
console.log(`[Hermes Panel] Listening on socket: ${SOCKET_PATH}`);
console.log(`[Hermes Panel] Static dir: ${STATIC_DIR}`);
console.log(`[Hermes Panel] Data dir: ${DATA_DIR}`);
console.log(`[Hermes Panel] Hermes bin: ${HERMES_BIN}`);
