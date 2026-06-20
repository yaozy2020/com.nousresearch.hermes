// @bun
// app_src/server/index.js — Hermes 面板入口（模块化后）
import { existsSync, chmodSync, readFileSync } from "fs";
import { CHANNEL_FIELDS, readConfig, writeConfig, readChannels, writeChannel, deleteChannel, lockDashboardConfig, initConfigModule, setEnvKey } from "./modules/config.js";
import { wsClients, readLogs, log, broadcastLog } from "./modules/logger.js";
import { json, parseBody } from "./modules/utils.js";
import { initI18n, t } from "./modules/i18n.js";
import { listBackups, createBackup, restoreBackup, deleteBackup } from "./modules/backup.js";
import { getEffectiveProviders, getUserProviders, addUserProvider, deleteUserProvider } from "./modules/providers.js";
import { listTrustedHashes, addTrustedHash, deleteTrustedHash } from "./modules/trust.js";
import { getOpenApi, renderSwaggerHtml } from "./modules/openapi.js";

// 启动时初始化 i18n（默认 zh-CN，未来可读 process.env.HERMES_LOCALE）
initI18n(process.env.HERMES_LOCALE || "zh-CN");

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
import { isAuthEnabled, verifyRequest, enableAuth, disableAuth, resetToken, checkResetMarker } from "./modules/auth.js";
import { checkGeneralLimit, isAuthLocked, recordAuthFailure, recordAuthSuccess } from "./modules/rate-limit.js";
import {
  isGatewayRunning, getGatewayPid, startGateway, stopGateway, getGatewayUptime,
  isDashboardRunning, getDashboardPid, startDashboard, stopDashboard, getDashboardUptime,
  installHermes, restartHermesAll, isInstallInProgress, validatePackageSpec, initHermesModule,
  getDashboardPort, getDashboardInsecure
} from "./modules/hermes.js";
import { isTtydAlive, getTtydPid, getTtydPort, getTtydUptime, startTtyd, stopTtyd, getTtydTargetUrl, TERM_COMMANDS } from "./modules/terminal.js";

process.on("uncaughtException", (err) => log("error", "uncaughtException", err));
process.on("unhandledRejection", (reason) => log("error", "unhandledRejection", reason));

const DATA_DIR = process.env.HERMES_DATA_DIR || "/var/apps/com.nousresearch.hermes/home/data";
const STATIC_DIR = process.env.STATIC_DIR || "./ui";
const SOCKET_PATH = process.env.SOCKET_PATH || "/tmp/hermes.sock";
const VENV_DIR = process.env.HERMES_VENV || `${DATA_DIR}/venv`;
const HERMES_BIN = process.env.HERMES_BIN || `${VENV_DIR}/bin/hermes`;
const DASHBOARD_PORT = parseInt(process.env.HERMES_DASHBOARD_PORT || "9119"); // initial 兜底; 实际显示用 getDashboardPort()
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

    // v0.31: 通用限流（每 IP 300/min）
    const limited = checkGeneralLimit(req);
    if (limited) return limited;

    // v0.31: API token 鉴权（默认关闭，HERMES_API_TOKEN 设置后启用）
    // 白名单：/api/auth/status 和 /api/health 不需鉴权（前端探测用）
    const isAuthExempt =
      pathname === "/api/auth/status" ||
      pathname === "/api/health" ||
      // /api/auth/verify 是 token 验证端点，自身要走 verifyRequest 但不走 lock 逻辑
      pathname === "/api/auth/verify";
    if (!isAuthExempt && isAuthEnabled()) {
      if (isAuthLocked(req)) {
        return errorResponse("Too many failed attempts, locked 15min", "AUTH_LOCKED", 429);
      }
      if (!verifyRequest(req)) {
        recordAuthFailure(req);
        return errorResponse("Authentication required", "UNAUTHORIZED", 401);
      }
      recordAuthSuccess(req);
    }

    // ========== /api/auth/* 鉴权管理端点 ==========
    if (pathname === "/api/auth/status" && method === "GET") {
      return json({ ok: true, enabled: isAuthEnabled() });
    }
    if (pathname === "/api/auth/verify" && method === "POST") {
      // 用于前端「测试 token」按钮
      if (!isAuthEnabled()) return json({ ok: true, valid: true, enabled: false });
      const valid = verifyRequest(req);
      if (!valid) {
        recordAuthFailure(req);
        return json({ ok: false, valid: false, enabled: true }, 401);
      }
      recordAuthSuccess(req);
      return json({ ok: true, valid: true, enabled: true });
    }
    if (pathname === "/api/auth/enable" && method === "POST") {
      // 启用鉴权 — 必须当前未启用，避免被恶意覆盖现有 token
      if (isAuthEnabled()) {
        return errorResponse("Auth already enabled, use /reset to rotate", "AUTH_ALREADY_ENABLED", 400);
      }
      const { plain } = enableAuth();
      log("info", "API auth enabled");
      return json({ ok: true, token: plain, message: "Token shown ONCE — copy it now." });
    }
    if (pathname === "/api/auth/disable" && method === "POST") {
      // 关闭鉴权（已通过 verifyRequest 校验）
      disableAuth();
      log("info", "API auth disabled");
      return json({ ok: true });
    }
    if (pathname === "/api/auth/reset" && method === "POST") {
      // 重置 token（已通过 verifyRequest 校验）— 仍要求当前已启用
      if (!isAuthEnabled()) {
        return errorResponse("Auth not enabled", "AUTH_NOT_ENABLED", 400);
      }
      const { plain } = resetToken();
      log("info", "API auth token rotated");
      return json({ ok: true, token: plain, message: "Token rotated — copy the new one now." });
    }

    if (pathname === "/api/providers/presets" && method === "GET") {
      try {
        // v0.30: 用 providers 模块统一加载 + 合并 user 覆盖
        const data = getEffectiveProviders();
        return json({ ok: true, ...data });
      } catch (err) {
        log("warn", "providers presets load failed:", err.message);
        return json({ ok: false, error: String(err.message || err), presets: [] }, 500);
      }
    }

    if (pathname === "/api/providers/user" && method === "GET") {
      return json({ ok: true, presets: getUserProviders() });
    }
    if (pathname === "/api/providers/user" && method === "POST") {
      const body = await safeParseBody(req);
      if (body instanceof Response) return body;
      const r = addUserProvider(body || {});
      return json(r, r.ok ? 200 : 400);
    }
    {
      const m = pathname.match(/^\/api\/providers\/user\/([A-Za-z0-9_.-]{1,64})$/);
      if (m && method === "DELETE") {
        const r = deleteUserProvider(m[1]);
        return json(r, r.ok ? 200 : 404);
      }
    }

    // === Backup / Restore ===
    if (pathname === "/api/backup/list" && method === "GET") {
      return json({ ok: true, backups: listBackups() });
    }
    if (pathname === "/api/backup/create" && method === "POST") {
      const r = createBackup();
      return json(r, r.ok ? 200 : 500);
    }
    if (pathname === "/api/backup/restore" && method === "POST") {
      const body = await safeParseBody(req);
      if (body instanceof Response) return body;
      if (!body.id) return json({ ok: false, error: "missing id" }, 400);
      const r = restoreBackup(body.id);
      return json(r, r.ok ? 200 : 400);
    }
    {
      const m = pathname.match(/^\/api\/backup\/([A-Za-z0-9._-]+)$/);
      if (m && method === "DELETE") {
        const r = deleteBackup(m[1]);
        return json(r, r.ok ? 200 : 404);
      }
    }

    // === Trust list (SHA256) ===
    if (pathname === "/api/trust/list" && method === "GET") {
      return json({ ok: true, hashes: listTrustedHashes() });
    }
    if (pathname === "/api/trust/add" && method === "POST") {
      const body = await safeParseBody(req);
      if (body instanceof Response) return body;
      const r = addTrustedHash(body && body.hash);
      return json(r, r.ok ? 200 : 400);
    }
    if (pathname === "/api/trust/delete" && method === "POST") {
      const body = await safeParseBody(req);
      if (body instanceof Response) return body;
      const r = deleteTrustedHash(body && body.hash);
      return json(r, r.ok ? 200 : 400);
    }

    // === OpenAPI / Swagger ===
    if (pathname === "/api/diagnostics/openapi" && method === "GET") {
      return json(getOpenApi());
    }
    if (pathname === "/api/docs" && method === "GET") {
      return new Response(renderSwaggerHtml(), {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    if (pathname === "/api/diagnostics" && method === "GET") {
      // U5: 一键健康自检 — 汇总 6~8 项检查供 UI 展示
      // 使用 i18n 字典（modules/i18n/zh-CN.json）以避免源码中文字面量在 fnOS bun 加载时被错误解码。
      const checks = [];
      const push = (id, label, status, detail) => checks.push({ id, label, status, detail });

      // 1) Bun runtime
      try {
        const bv = (typeof Bun !== "undefined" && Bun.version) ? String(Bun.version) : "unknown";
        const major = parseInt(bv.split(".")[0] || "0", 10);
        push("bun", t("diag.bun_runtime"), major >= 1 ? "ok" : "warn", `v${bv}`);
      } catch (e) { push("bun", t("diag.bun_runtime"), "error", String(e)); }

      // 2) hermes-agent installed
      try {
        const installed = existsSync(HERMES_BIN);
        push("hermes-bin", t("diag.hermes_installed"), installed ? "ok" : "warn",
          installed ? HERMES_BIN : t("diag.hermes_not_installed"));
      } catch (e) { push("hermes-bin", t("diag.hermes_installed"), "error", String(e)); }

      // 3) Gateway running
      try {
        const running = isGatewayRunning();
        push("gateway", t("diag.gateway"), running ? "ok" : "warn",
          running ? t("diag.running_with_pid_uptime", { pid: getGatewayPid(), uptime: getGatewayUptime() })
                  : t("diag.not_started"));
      } catch (e) { push("gateway", t("diag.gateway"), "error", String(e)); }

      // 4) Dashboard running
      try {
        const running = isDashboardRunning();
        push("dashboard", t("diag.dashboard"), running ? "ok" : "warn",
          running ? t("diag.running_with_pid_port", { pid: getDashboardPid(), port: getDashboardPort() })
                  : t("diag.not_started"));
      } catch (e) { push("dashboard", t("diag.dashboard"), "error", String(e)); }

      // 5) Provider API Key
      try {
        const cfg = readConfig();
        const envText = cfg.env || "";
        let keyOk = false;
        let providerName = "";
        for (const line of envText.split(/\r?\n/)) {
          const m = line.match(/^([A-Z][A-Z0-9_]*_API_KEY)\s*=\s*(.+)$/);
          if (!m) continue;
          const v = m[2].trim();
          if (v && v !== "__MASKED__" && !v.startsWith("#")) {
            keyOk = true;
            providerName = m[1];
            break;
          }
        }
        push("provider-key", t("diag.provider_api_key"), keyOk ? "ok" : "warn",
          keyOk ? t("diag.provider_api_key_ok", { name: providerName }) : t("diag.provider_api_key_warn"));
      } catch (e) { push("provider-key", t("diag.provider_api_key"), "error", String(e)); }

      // 6) Provider selected
      try {
        const cfg = readConfig();
        const yaml = cfg.yaml || "";
        const m = yaml.match(/^\s*provider\s*:\s*(\S+)/m);
        push("provider-cfg", t("diag.provider_selected"), m ? "ok" : "warn",
          m ? `provider: ${m[1]}` : t("diag.provider_selected_warn"));
      } catch (e) { push("provider-cfg", t("diag.provider_selected"), "error", String(e)); }

      // 7) Dashboard listen mode
      try {
        const insecure = process.env.HERMES_DASHBOARD_INSECURE !== "0";
        push("dashboard-mode", t("diag.dashboard_listen"),
          insecure ? "warn" : "ok",
          insecure ? t("diag.dashboard_external") : t("diag.dashboard_local"));
      } catch (e) { push("dashboard-mode", t("diag.dashboard_listen"), "error", String(e)); }

      // 8) ttyd binary
      try {
        const ok = existsSync(TTYD_BIN);
        push("ttyd", t("diag.ttyd_bin"), ok ? "ok" : "error",
          ok ? TTYD_BIN : t("diag.ttyd_bin_missing"));
      } catch (e) { push("ttyd", t("diag.ttyd_bin"), "error", String(e)); }

      const summary = {
        ok: checks.filter(c => c.status === "ok").length,
        warn: checks.filter(c => c.status === "warn").length,
        error: checks.filter(c => c.status === "error").length,
      };

      // v0.30: 异常时通过 broadcastLog 推前端 toast（携带 level=warn|error）
      try {
        if (summary.error > 0) {
          broadcastLog("[diagnostics] " + t("alert.diag_error", { error: summary.error }), { level: "error", code: "DIAG_ERROR" });
        } else if (summary.warn > 0) {
          broadcastLog("[diagnostics] " + t("alert.diag_warn", { warn: summary.warn }), { level: "warn", code: "DIAG_WARN" });
        }
      } catch {}

      return json({ ok: true, summary, checks, time: new Date().toISOString() });
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
        dashboardPort: getDashboardPort(),
        ttydRunning: isTtydAlive(),
        ttydPid: getTtydPid(),
        ttydUptime: getTtydUptime(),
        ttydPort: getTtydPort(),
        dashboardInsecure: getDashboardInsecure(),
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
      return json({ running: isDashboardRunning(), pid: getDashboardPid(), uptime: getDashboardUptime(), port: getDashboardPort(), insecure: getDashboardInsecure() });
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
    // v0.30.5: 应用设置 — 单独修改 Dashboard 端口（不需要重装）
    if (pathname === "/api/settings/dashboard-port" && method === "GET") {
      return json({ ok: true, port: getDashboardPort() });
    }
    if (pathname === "/api/settings/dashboard-port" && method === "POST") {
      const body = await safeParseBody(req);
      if (body instanceof Response) return body;
      const port = parseInt(body && body.port, 10);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        return errorResponse("port 必须在 1024-65535 之间", 400, "invalid_port");
      }
      const result = setEnvKey("HERMES_DASHBOARD_PORT", String(port));
      if (!result.ok) return json(result, 400);
      // v0.30.6: 写完 .env 立即重启 Dashboard 让新端口生效；fnOS 主面板进程不需要重启
      let restarted = false;
      let restartError = null;
      if (isDashboardRunning()) {
        try {
          await stopDashboard();
          await new Promise((r) => setTimeout(r, 1500));
          const r = await startDashboard();
          restarted = !!r.ok;
          if (!r.ok) restartError = r.error || "restart failed";
        } catch (err) {
          restartError = String(err && err.message || err);
        }
      }
      return json({ ok: true, port, restarted, restartError });
    }
    // v0.30.6: Dashboard 访问模式（本地/外部）开关，写 .env 后自动重启 Dashboard
    if (pathname === "/api/settings/dashboard-mode" && method === "GET") {
      return json({ ok: true, insecure: getDashboardInsecure(), port: getDashboardPort() });
    }
    if (pathname === "/api/settings/dashboard-mode" && method === "POST") {
      const body = await safeParseBody(req);
      if (body instanceof Response) return body;
      const insecure = !!(body && body.insecure);
      const result = setEnvKey("HERMES_DASHBOARD_INSECURE", insecure ? "1" : "0");
      if (!result.ok) return json(result, 400);
      let restarted = false;
      let restartError = null;
      if (isDashboardRunning()) {
        try {
          await stopDashboard();
          await new Promise((r) => setTimeout(r, 1500));
          const r = await startDashboard();
          restarted = !!r.ok;
          if (!r.ok) restartError = r.error || "restart failed";
        } catch (err) {
          restartError = String(err && err.message || err);
        }
      }
      return json({ ok: true, insecure, restarted, restartError });
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
      // 注意：本接口直接把 stdin 字节流转发给 ttyd 后端 WebSocket。
      // terminal-shell.js 的命令白名单只在 ttyd 启动时校验 argv，
      // 启动后子命令（如 hermes setup）的交互式输入由该子命令自身负责处理。
      // 这里仅做长度限制，防止超大 payload DoS。
      const body = await safeParseBody(req);
      if (body instanceof Response) return body;
      const seq = (body && body.input) || (body && body.cmd) || (body && body.data) || "";
      if (typeof seq !== "string") {
        return json({ ok: false, error: "invalid payload" }, 400);
      }
      if (seq.length > 4096) {
        return json({ ok: false, error: "payload too large (>4KB)" }, 413);
      }
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

// 启动前显式初始化关键模块（避免依赖模块顶层副作用）
initConfigModule();
initHermesModule();

// v0.31: 启动时检测 .reset_token 兜底标记 — 文件存在则清空 API token + 删标记
if (checkResetMarker()) {
  log("warn", "API auth was reset by .reset_token marker file");
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
