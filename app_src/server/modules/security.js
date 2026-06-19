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

function isLocalhost(host) {
  if (!host) return false;
  const h = host.toLowerCase().split(":")[0];
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

export function isSafeWriteRequest(req) {
  const method = req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");

  // 允许 Origin: null（iframe sandbox / 本地文件等受限场景）
  if (origin === "null") return true;

  // 优先使用 Host 头部作为请求主机；Unix socket 场景 req.url 可能为 localhost
  let reqHost = null;
  try {
    const hostHeader = req.headers.get("host");
    if (hostHeader) {
      reqHost = hostHeader.toLowerCase();
    } else {
      reqHost = new URL(req.url).host.toLowerCase();
    }
  } catch {}

  const trustedHosts = getTrustedHosts(reqHost);

  // 若 Host 是 localhost 且 Origin/Referer 来自内网 IP，也放行（fnOS gateway 常见场景）
  function isTrusted(headerHost) {
    if (trustedHosts.has(headerHost)) return true;
    if (isLocalhost(reqHost)) {
      const bare = headerHost.split(":")[0];
      // 内网 IPv4
      if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(bare)) return true;
    }
    return false;
  }

  if (origin) {
    try {
      return isTrusted(new URL(origin).host.toLowerCase());
    } catch {
      return false;
    }
  }

  if (referer) {
    try {
      return isTrusted(new URL(referer).host.toLowerCase());
    } catch {
      return false;
    }
  }

  // 既无 Origin 也无 Referer：直接请求/脚本调用，放行
  return true;
}
