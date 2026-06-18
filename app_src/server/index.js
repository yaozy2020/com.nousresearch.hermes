// @bun
// app_src/server/index.js — Hermes 面板入口（模块化后）
import { existsSync, chmodSync } from "fs";
import { CHANNEL_FIELDS, readConfig, writeConfig, readChannels, writeChannel, deleteChannel } from "./modules/config.js";
import { wsClients, readLogs, log } from "./modules/logger.js";
import { json, parseBody } from "./modules/utils.js";
import { serveStatic } from "./modules/static.js";
import { getVersion } from "./modules/version.js";
import {
  isGatewayRunning, getGatewayPid, startGateway, stopGateway,
  isDashboardRunning, getDashboardPid, startDashboard, stopDashboard,
  installHermes, restartHermesAll
} from "./modules/hermes.js";
import { isTtydAlive, getTtydPid, startTtyd, stopTtyd, proxyTerminal, TERM_COMMANDS } from "./modules/terminal.js";

process.on("uncaughtException", (err) => log("error", "uncaughtException", err));
process.on("unhandledRejection", (reason) => log("error", "unhandledRejection", reason));

const DATA_DIR = process.env.HERMES_DATA_DIR || "/var/apps/com.nousresearch.hermes/home/data";
const STATIC_DIR = process.env.STATIC_DIR || "./ui";
const SOCKET_PATH = process.env.SOCKET_PATH || "/tmp/hermes.sock";
const VENV_DIR = process.env.HERMES_VENV || `${DATA_DIR}/venv`;
const HERMES_BIN = process.env.HERMES_BIN || `${VENV_DIR}/bin/hermes`;
const DASHBOARD_PORT = parseInt(process.env.HERMES_DASHBOARD_PORT || "9119");
const TERM_PORT = parseInt(process.env.HERMES_TERM_PORT || "9123");
const BIN_DIR = process.env.HERMES_PANEL_BIN || (process.env.TRIM_APPDEST ? `${process.env.TRIM_APPDEST}/bin` : "./bin");
const TTYD_BIN = `${BIN_DIR}/ttyd`;

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
      return json({
        ok: true,
        time: new Date().toISOString(),
        hermesInstalled: existsSync(HERMES_BIN),
        venv: VENV_DIR,
        bin: HERMES_BIN,
        gatewayRunning: isGatewayRunning(),
        gatewayPid: getGatewayPid(),
        dashboardRunning: isDashboardRunning(),
        dashboardPid: getDashboardPid(),
        dashboardPort: DASHBOARD_PORT,
        version: getVersion()
      });
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
      return json({ installed: existsSync(HERMES_BIN), venv: VENV_DIR, bin: HERMES_BIN });
    }
    if (pathname === "/api/hermes/install" && method === "POST") {
      const body = await parseBody(req);
      const packageSpec = body.package || "hermes-agent";
      const result = await installHermes(packageSpec);
      return json(result, result.ok ? 200 : 500);
    }
    if (pathname === "/api/dashboard/status" && method === "GET") {
      return json({ running: isDashboardRunning(), pid: getDashboardPid(), port: DASHBOARD_PORT });
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

  // ── /terminal/* 反代到 ttyd ──
  if (pathname === "/terminal" || pathname.startsWith("/terminal/")) {
    const suffix = pathname.replace(/^\/terminal/, "") || "/";
    return proxyTerminal(req, suffix + (url.search || ""));
  }

  return serveStatic(pathname);
}

const server = Bun.serve({
  unix: SOCKET_PATH,
  async fetch(req, srv) {
    try {
      const url = new URL(req.url);
      if (url.pathname === "/api/logs/stream" && srv) {
        if (srv.upgrade(req)) return;
      }
      return await handleRequest(req);
    } catch (err) {
      log("error", "Request failed:", err);
      return json({ ok: false, error: "Internal Server Error" }, 500);
    }
  },
  websocket: {
    open(ws) { wsClients.add(ws); },
    message(ws, msg) { /* 预留：可扩展为前端 -> 后端命令通道 */ },
    close(ws) { wsClients.delete(ws); }
  },
  error(err) {
    log("error", "Server error:", err);
    return json({ ok: false, error: "Internal Error" }, 500);
  }
});

try { chmodSync(SOCKET_PATH, 0o660); } catch {}
log("info", `Listening on socket: ${SOCKET_PATH}`);
log("info", `Static dir: ${STATIC_DIR}`);
log("info", `Data dir: ${DATA_DIR}`);
log("info", `Hermes bin: ${HERMES_BIN}`);
