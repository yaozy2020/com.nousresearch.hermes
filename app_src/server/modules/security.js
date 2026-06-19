// @bun
// CSRF / 来源校验工具

export function getTrustedHosts(reqHost) {
  const trusted = new Set();
  if (reqHost) trusted.add(reqHost.toLowerCase());
  const env = process.env.HERMES_TRUSTED_HOSTS || "";
  for (const h of env.split(",")) {
    const host = h.trim();
    if (host) trusted.add(host.toLowerCase());
  }
  return trusted;
}

export function isSafeWriteRequest(req) {
  const method = req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");

  // 允许 Origin: null（iframe sandbox / 本地文件等受限场景）
  if (origin === "null") return true;

  let reqHost = null;
  try {
    reqHost = new URL(req.url).host.toLowerCase();
  } catch {}
  const trustedHosts = getTrustedHosts(reqHost);

  if (origin) {
    try {
      return trustedHosts.has(new URL(origin).host.toLowerCase());
    } catch {
      return false;
    }
  }

  if (referer) {
    try {
      return trustedHosts.has(new URL(referer).host.toLowerCase());
    } catch {
      return false;
    }
  }

  // 既无 Origin 也无 Referer：直接请求/脚本调用，放行
  return true;
}
