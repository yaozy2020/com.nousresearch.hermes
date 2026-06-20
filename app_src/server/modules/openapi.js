// @bun
// OpenAPI 3.1 规范（仅核心端点，便于外部接入）。
// 通过 readFileSync 显式 utf-8 加载 description 文案；spec 主体常量为 ASCII 安全。
const SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Hermes Panel API",
    version: "v1",
    description: "Hermes for fnOS control panel — diagnostics, gateway, dashboard, providers, backup, trust list."
  },
  servers: [
    { url: "/app/com-nousresearch-hermes", description: "fnOS gateway prefix" },
    { url: "/", description: "direct unix socket / dev" }
  ],
  paths: {
    "/api/health": { get: { summary: "Aggregate panel health", responses: { "200": ok("Health snapshot") } } },
    "/api/diagnostics": { get: { summary: "Run 8 diagnostic checks", responses: { "200": ok("Checks") } } },
    "/api/status": { get: { summary: "Gateway running status", responses: { "200": ok("Status") } } },
    "/api/gateway/start": { post: { summary: "Start hermes gateway", responses: { "200": ok("Result") } } },
    "/api/gateway/stop": { post: { summary: "Stop hermes gateway", responses: { "200": ok("Result") } } },
    "/api/gateway/restart": { post: { summary: "Restart hermes gateway", responses: { "200": ok("Result") } } },
    "/api/dashboard/start": { post: { summary: "Start hermes dashboard", responses: { "200": ok("Result") } } },
    "/api/dashboard/stop": { post: { summary: "Stop hermes dashboard", responses: { "200": ok("Result") } } },
    "/api/config": {
      get: { summary: "Read user config (.env + config.yaml)", responses: { "200": ok("Config") } },
      post: { summary: "Write user config", responses: { "200": ok("Result") } }
    },
    "/api/logs": { get: { summary: "Recent panel logs", parameters: [linesParam()], responses: { "200": ok("Logs") } } },
    "/api/version": { get: { summary: "Panel + hermes version info", responses: { "200": ok("Versions") } } },
    "/api/providers/presets": { get: { summary: "List effective providers (builtin + user)", responses: { "200": ok("Presets") } } },
    "/api/providers/user": {
      get: { summary: "List user-defined providers", responses: { "200": ok("Presets") } },
      post: { summary: "Add user-defined provider", responses: { "200": ok("Provider") } }
    },
    "/api/providers/user/{name}": {
      delete: {
        summary: "Delete user-defined provider",
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": ok("Result") }
      }
    },
    "/api/backup/list": { get: { summary: "List backups", responses: { "200": ok("Backups") } } },
    "/api/backup/create": { post: { summary: "Create backup snapshot", responses: { "200": ok("Backup") } } },
    "/api/backup/restore": { post: { summary: "Restore backup by id", responses: { "200": ok("Result") } } },
    "/api/backup/{id}": {
      delete: {
        summary: "Delete backup",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": ok("Result") }
      }
    },
    "/api/trust/list": { get: { summary: "List trusted SHA256 hashes", responses: { "200": ok("Hashes") } } },
    "/api/trust/add": { post: { summary: "Add trusted hash", responses: { "200": ok("Result") } } },
    "/api/trust/delete": { post: { summary: "Delete trusted hash", responses: { "200": ok("Result") } } },
    "/api/diagnostics/openapi": { get: { summary: "OpenAPI 3.1 spec for this panel", responses: { "200": ok("OpenAPI") } } },
    "/api/docs": { get: { summary: "Embedded Swagger UI", responses: { "200": { description: "HTML" } } } }
  }
};

function ok(desc) { return { description: desc, content: { "application/json": { schema: { type: "object" } } } }; }
function linesParam() { return { name: "lines", in: "query", schema: { type: "integer", default: 200 } }; }

export function getOpenApi() { return SPEC; }

// 内嵌 Swagger UI HTML（CDN unpkg）。考虑到内网环境 CDN 可能不可达，
// 我们提供一个最小可用的 fallback：直接 fetch /api/diagnostics/openapi 列出 paths。
export function renderSwaggerHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Hermes Panel API</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 24px; background: #0f172a; color: #e2e8f0; }
  h1 { color: #38bdf8; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { padding: 8px 12px; border-bottom: 1px solid #1e293b; text-align: left; font-size: 14px; vertical-align: top; }
  th { color: #94a3b8; font-weight: 500; }
  .method { font-weight: 700; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
  .get { background: #064e3b; color: #6ee7b7; }
  .post { background: #1e3a8a; color: #93c5fd; }
  .delete { background: #7f1d1d; color: #fca5a5; }
  code { background: #1e293b; padding: 2px 6px; border-radius: 3px; }
  .empty { color: #64748b; }
</style>
</head>
<body>
<h1>Hermes Panel API</h1>
<p>OpenAPI 3.1 — see <a href="diagnostics/openapi" style="color:#38bdf8;">diagnostics/openapi</a> for raw JSON.</p>
<table id="ops"><thead><tr><th>Method</th><th>Path</th><th>Summary</th></tr></thead><tbody></tbody></table>
<script>
fetch('diagnostics/openapi').then(r => r.json()).then(spec => {
  const tbody = document.querySelector('#ops tbody');
  Object.entries(spec.paths || {}).forEach(([path, ops]) => {
    Object.entries(ops).forEach(([method, info]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td><span class="method ' + method + '">' + method.toUpperCase() + '</span></td>'
        + '<td><code>' + path + '</code></td>'
        + '<td>' + (info.summary || '') + '</td>';
      tbody.appendChild(tr);
    });
  });
}).catch(e => {
  document.querySelector('#ops tbody').innerHTML = '<tr><td colspan=3 class=empty>load failed: ' + e.message + '</td></tr>';
});
</script>
</body>
</html>`;
}
