// @bun
// app_src/server/index.js — Hermes 面板入口（模块化后）
import { existsSync, chmodSync, readFileSync } from "fs";
import { CHANNEL_FIELDS, readConfig, writeConfig, readChannels, writeChannel, deleteChannel, lockDashboardConfig } from "./modules/config.js";
import { wsClients, readLogs, log } from "./modules/logger.js";
import { json, parseBody } from "./modules/utils.js";

async function safeParseBody(req) {
  try {
    return await parseBody(req);
  } catch (err) {
    return errorResponse(err.message, 400, "invalid_body");
  }
}
import { serveStatic } from "./modules/static.js";
import { getVersion } from "./modules/version.js";
import { errorResponse } from "./modules/error.js";
import { isSafeWriteRequest, isSafeReadRequest } from "./modules/security.js";
import {
  isGatewayRunning, getGatewayPid, startGateway, stopGateway, getGatewayUptime,
  isDashboardRunning, getDashboardPid, startDashboard, stopDashboard, getDashboardUptime,
  installHermes, restartHermesAll, isInstallInProgress, validatePackageSpec
} from "./modules/hermes.js";
import { isTtydAlive, getTtydPid, getTtydPort, getTtydUptime, startTtyd, stopTtyd, getTtydTargetUrl, TERM_COMMANDS } from "./modules/terminal.js";

process.on("uncaughtException", (err) => log("error", "uncaughtException", err));
process.on("unhandledRejection", (reason) => log("error", "unhandledRejection", reason));

const DATA_DIR = process.env.HERMES_DATA_DIR || "/var/apps/com.nousresearch.hermes/home/data";
const STATIC_DIR = process.env.STATIC_DIR || "./ui";
const SOCKET_PATH = process.env.SOCKET_PATH || "/tmp/hermes.sock";
const VENV_DIR = process.env.HERMES_VENV || `${DATA_DIR}/venv`;
const HERMES_BIN = process.env.HERMES_BIN || `${VENV_DIR}/bin/hermes`;
const DASHBOARD_PORT = parseInt(process.env.HERMES_DASHBOARD_PORT || "9119");
const BIN_DIR = process.env.HERMES_PANEL_BIN || (process.env.TRIM_APPDEST ? `${process.env.TRIM_APPDEST}/bin` : "./bin");
const TTYD_BIN = `${BIN_DIR}/ttyd`;

// 活跃终端 WebSocket 代理连接：clientWs -> backendWs
const terminalProxies = new Map();
let activeTerminalBackend = null;

function getTtydChildPids(pid) {
  const path = `/proc/${pid}/task/${pid}/children`;
  if (!existsSync(path)) return [];
  try {
    const text = readFileSync(path, "utf-8").trim();
    return text ? text.split(/\s+/).map(Number).filter((n) => n > 0) : [];
  } catch { return []; }
}

function stripGatewayPrefix(pathname) {
  const GATEWAY_PREFIX = "/app/com-nousresearch-hermes";
  if (pathname.startsWith(GATEWAY_PREFIX)) {
    return pathname.slice(GATEWAY_PREFIX.length) || "/";
  }
  return pathname;
}

async function proxyTerminalHttp(req, pathname) {
  if (!isTtydAlive()) {
    return new Response("Terminal not started. POST /api/terminal/start first.", { status: 503 });
  }

  // 防止恶意网页通过 iframe 嵌入终端做点击劫持
  if (req.method === "GET" && !isSafeReadRequest(req)) {
    return new Response("Forbidden: untrusted origin", { status: 403 });
  }

  const url = new URL(req.url);
  const suffix = pathname.replace(/^\/ttyd/, "") || "/";
  const targetUrl = getTtydTargetUrl(suffix + (url.search || ""));
  if (!targetUrl) {
    return new Response("Terminal unavailable", { status: 503 });
  }

  try {
    const headers = new Headers(req.headers);
    headers.delete("host");
    headers.set("host", `127.0.0.1:${getTtydPort()}`);
    const res = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.body,
      redirect: "manual",
      compress: false
    });
    const body = await res.arrayBuffer();
    const resHeaders = new Headers(res.headers);
    resHeaders.delete("content-encoding");
    resHeaders.set("content-length", String(body.byteLength));
    // 防止终端被嵌入第三方页面
    resHeaders.set("X-Frame-Options", "DENY");
    resHeaders.set("Content-Security-Policy", "frame-ancestors 'self'");
    // 重写 location，避免客户端跳到 127.0.0.1:<ttyd-port>
    const location = resHeaders.get("location");
    if (location) {
      const ttydPort = getTtydPort();
      const proto = req.headers.get("x-forwarded-proto") === "https" ? "https" : "http";
      const host = req.headers.get("host") || "localhost";
      // ttyd 返回的 location 形如 http://127.0.0.1:9123/ttyd/...，需要替换为网关前缀路径
      const localBase = `http://127.0.0.1:${ttydPort}`;
      if (location.toLowerCase().startsWith(localBase.toLowerCase())) {
        const publicBase = `${proto}://${host}`;
        resHeaders.set("location", location.replace(localBase, publicBase));
      } else if (location === "/ttyd/" || location.startsWith("/ttyd/")) {
        // 相对路径或绝对路径 /ttyd/...，补上网关前缀
        const gatewayPrefix = url.pathname.replace(/\/?ttyd\/?$/, "") || "";
        resHeaders.set("location", gatewayPrefix + location);
      }
    }
    return new Response(body, { status: res.status, statusText: res.statusText, headers: resHeaders });
  } catch (err) {
    log("terminal", "error", "proxy error:", err);
    return new Response("Terminal proxy error", { status: 502 });
  }
}

async function handleRequest(req) {
  const url = new URL(req.url);
  let pathname = stripGatewayPrefix(url.pathname);
  const method = req.method;

  if (pathname.startsWith("/api/")) {
    if (!isSafeWriteRequest(req)) {
      return errorResponse("Forbidden: untrusted origin", "FORBIDDEN_ORIGIN", 403);
    }

    if (pathname === "/api/health" && method === "GET") {
      return json({
        ok: true,
        time: new Date().toISOString(),
        hermesInstalled: existsSync(HERMES_BIN),
        hermesInstalling: isInstallInProgress(),
        venv: VENV_DIR,
        bin: HERMES_BIN,
        gatewayRunning: isGatewayRunning(),
        gatewayPid: getGatewayPid(),
        gatewayUptime: getGatewayUptime(),
        dashboardRunning: isDashboardRunning(),
        dashboardPid: getDashboardPid(),
        dashboardUptime: getDashboardUptime(),
        dashboardPort: DASHBOARD_PORT,
        ttydRunning: isTtydAlive(),
        ttydPid: getTtydPid(),
        ttydUptime: getTtydUptime(),
        ttydPort: getTtydPort(),
        dashboardInsecure: process.env.HERMES_DASHBOARD_INSECURE !== "0",
        version: await getVersion()
      });
    }
    if (pathname === "/api/status" && method === "GET") {
      return json({
        running: isGatewayRunning(),
        pid: getGatewayPid(),
        uptime: getGatewayUptime(),
        version: await getVersion()
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
      const body = await safeParseBody(req);
      if (body instanceof Response) return body;
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
          const body = await safeParseBody(req);
      if (body instanceof Response) return body;
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
      return json(await getVersion());
    }
    if (pathname === "/api/hermes/status" && method === "GET") {
      return json({ installed: existsSync(HERMES_BIN), installing: isInstallInProgress(), venv: VENV_DIR, bin: HERMES_BIN });
    }
    if (pathname === "/api/hermes/install" && method === "POST") {
      const body = await safeParseBody(req);
      if (body instanceof Response) return body;
      const packageSpec = body.package || "hermes-agent";
      const validation = validatePackageSpec(packageSpec);
      if (!validation.ok) {
        return errorResponse(validation.error, 400, "invalid_package_spec");
      }
      const result = await installHermes(packageSpec);
      return json(result, result.ok ? 200 : 500);
    }
    if (pathname === "/api/dashboard/status" && method === "GET") {
      return json({ running: isDashboardRunning(), pid: getDashboardPid(), uptime: getDashboardUptime(), port: DASHBOARD_PORT, insecure: process.env.HERMES_DASHBOARD_INSECURE !== "0" });
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
    if (pathname === "/api/dashboard/lock" && method === "POST") {
      const result = lockDashboardConfig();
      return json(result, result.ok ? 200 : 500);
    }
    if (pathname === "/api/hermes/restart" && method === "POST") {
      const result = await restartHermesAll();
      return json(result);
    }
    if (pathname === "/api/hermes/stop_all" && method === "POST") {
      const gw = await stopGateway();
      const db = await stopDashboard();
      return json({ ok: true, gateway: gw, dashboard: db });
    }
    // ── Terminal (ttyd) ──
    if (pathname === "/api/terminal/status" && method === "GET") {
      return json({
        running: isTtydAlive(),
        pid: getTtydPid(),
        port: getTtydPort(),
        uptime: getTtydUptime(),
        ttyd_available: existsSync(TTYD_BIN),
        commands: Object.keys(TERM_COMMANDS)
      });
    }
    if (pathname === "/api/terminal/send" && method === "POST") {
      const body = await safeParseBody(req);
      if (body instanceof Response) return body;
      const seq = (body && body.input) || (body && body.cmd) || (body && body.data) || "";
      if (!activeTerminalBackend || activeTerminalBackend.readyState !== WebSocket.OPEN) {
        return json({ ok: false, error: "终端未连接" }, 400);
      }
      try {
        const encoded = new TextEncoder().encode(seq);
        const payload = new Uint8Array(1 + encoded.length);
        payload[0] = 0x30; // ttyd Command.INPUT
        payload.set(encoded, 1);
        activeTerminalBackend.send(payload);
        return json({ ok: true });
      } catch (err) {
        return json({ ok: false, error: String(err) }, 500);
      }
    }
    if (pathname === "/api/terminal/signal" && method === "POST") {
      const body = await safeParseBody(req);
      if (body instanceof Response) return body;
      const sig = (body && body.signal) || "SIGINT";
      const pid = getTtydPid();
      if (!pid) return json({ ok: false, error: "终端未运行" }, 400);
      const children = getTtydChildPids(pid);
      if (children.length === 0) {
        // 没拿到子进程时直接发给 ttyd 自己，让它处理
        try { process.kill(pid, sig); return json({ ok: true }); } catch (err) {
          return json({ ok: false, error: String(err) }, 500);
        }
      }
      let ok = false;
      for (const child of children) {
        try { process.kill(child, sig); ok = true; } catch {}
        try { process.kill(-child, sig); } catch {}
      }
      return json({ ok });
    }
    if (pathname === "/api/terminal/start" && method === "POST") {
      const body = await safeParseBody(req);
      if (body instanceof Response) return body;
      const cmd = (body && body.cmd) || "setup";
      const mobile = !!(body && body.mobile);
      const result = await startTtyd(cmd, { mobile });
      return json(result, result.ok ? 200 : 500);
    }
    if (pathname === "/api/terminal/stop" && method === "POST") {
      const result = await stopTtyd();
      return json(result);
    }
    if (pathname === "/api/terminal/ttyd_log" && method === "GET") {
      const logFile = `${DATA_DIR}/runtime/ttyd.log`;
      const content = existsSync(logFile) ? readFileSync(logFile, "utf-8") : "";
      return new Response(content, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    if (pathname === "/api/terminal/server_log" && method === "GET") {
      const logFile = `${DATA_DIR}/logs/gateway.log`;
      const content = existsSync(logFile) ? readFileSync(logFile, "utf-8") : "";
      return new Response(content, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    return json({ error: "not found" }, 404);
  }

  // ── /ttyd-mobile 移动端终端外壳 ──
  if (pathname === "/ttyd-mobile" || pathname.startsWith("/ttyd-mobile/")) {
    return serveStatic("/ttyd-mobile.html");
  }

  return serveStatic(pathname);
}

const server = Bun.serve({
  unix: SOCKET_PATH,
  async fetch(req, srv) {
    try {
      const url = new URL(req.url);
      const pathname = stripGatewayPrefix(url.pathname);

      if (pathname === "/api/logs/stream") {
        if (srv.upgrade(req, { data: { type: "logs" } })) return;
      }

      // ── /ttyd/* 反代到 ttyd（HTTP + WebSocket） ──
      if (pathname === "/ttyd" || pathname.startsWith("/ttyd/")) {
        // 安全：终端路径必须来自受信任来源（同域或 fnOS 网关）
        if (!isSafeWriteRequest(req)) {
          return errorResponse("Forbidden: untrusted origin", "FORBIDDEN_ORIGIN", 403);
        }
        if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
          const suffix = pathname.replace(/^\/ttyd/, "") || "/";
          const targetHttp = getTtydTargetUrl(suffix + url.search);
          if (!targetHttp) return new Response("Terminal unavailable", { status: 503 });
          const backendUrl = targetHttp.replace(/^http/, "ws");
          const upgradeOpts = { data: { type: "terminal", backendUrl } };
          const protocols = req.headers.get("sec-websocket-protocol");
          if (protocols) {
            const chosen = protocols.split(",").map((s) => s.trim()).find((p) => p === "tty") || protocols.split(",")[0].trim();
            upgradeOpts.headers = { "Sec-WebSocket-Protocol": chosen };
          }
          log("terminal", "info", "ws upgrade", pathname, "->", backendUrl, "protocols:", protocols || "none");
          if (srv.upgrade(req, upgradeOpts)) return;
          return new Response("Terminal upgrade failed", { status: 500 });
        }
        return await proxyTerminalHttp(req, pathname);
      }

      return await handleRequest(req);
    } catch (err) {
      log("error", "Request failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      return json({ ok: false, error: "Internal Server Error", detail: message }, 500);
    }
  },
  websocket: {
    open(ws) {
      if (ws.data?.type === "terminal") {
        const backendUrl = ws.data.backendUrl;
        if (!backendUrl) { ws.close(); return; }
        try {
          const backend = new WebSocket(backendUrl, ["tty"]);
          backend.binaryType = "arraybuffer";
          terminalProxies.set(ws, backend);
          backend.onopen = () => {
            activeTerminalBackend = backend;
          };
          backend.onmessage = (event) => {
            try { ws.send(event.data); } catch {}
          };
          backend.onclose = () => {
            if (activeTerminalBackend === backend) activeTerminalBackend = null;
            try { ws.close(); } catch {}
          };
          backend.onerror = () => {
            try { ws.close(); } catch {}
          };
          ws.onclose = () => {
            terminalProxies.delete(ws);
            if (activeTerminalBackend === backend) activeTerminalBackend = null;
            try { backend.close(); } catch {}
          };
        } catch (err) {
          log("terminal", "error", "ws proxy connect failed:", err);
          ws.close();
        }
        return;
      }
      // logs
      wsClients.add(ws);
    },
    message(ws, msg) {
      if (ws.data?.type === "terminal") {
        const backend = terminalProxies.get(ws);
        if (backend && backend.readyState === WebSocket.OPEN) {
          try { backend.send(msg); } catch {}
        }
        return;
      }
      // logs 通道目前只发不收
    },
    close(ws) {
      if (ws.data?.type === "terminal") {
        const backend = terminalProxies.get(ws);
        terminalProxies.delete(ws);
        try { backend?.close(); } catch {}
        return;
      }
      wsClients.delete(ws);
    }
  },
  error(err) {
    log("panel", "error", "Server error:", err);
    return json({ ok: false, error: "Internal Error" }, 500);
  }
});

try { chmodSync(SOCKET_PATH, 0o660); } catch {}
log("panel", "info", `Listening on socket: ${SOCKET_PATH}`);
log("panel", "info", `Static dir: ${STATIC_DIR}`);
log("panel", "info", `Data dir: ${DATA_DIR}`);
log("panel", "info", `Hermes bin: ${HERMES_BIN}`);
