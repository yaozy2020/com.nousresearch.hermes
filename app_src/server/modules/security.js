// @bun
// CSRF / 来源校验工具

function bareHost(host) {
  if (!host) return "";
  return host.toLowerCase().split(":")[0];
}

export function getTrustedHosts(reqHost) {
  const trusted = new Set();
  if (reqHost) {
    trusted.add(reqHost.toLowerCase());
    trusted.add(bareHost(reqHost));
  }
  const env = process.env.HERMES_TRUSTED_HOSTS || "";
  for (const h of env.split(",")) {
    const host = h.trim();
    if (host) {
      trusted.add(host.toLowerCase());
      trusted.add(bareHost(host));
    }
  }
  return trusted;
}

function isLocalhost(host) {
  const h = bareHost(host);
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function isPrivateIPv4(host) {
  const h = bareHost(host);
  return /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(h);
}

export function isSafeWriteRequest(req) {
  const method = req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");

  // 允许 Origin: null（iframe sandbox / 本地文件等受限场景）
  if (origin === "null") return true;

  // 优先使用 Host 头部作为请求主机；Unix socket 场景 req.url 可能为 localhost
  let reqHost = "";
  try {
    const hostHeader = req.headers.get("host");
    if (hostHeader) {
      reqHost = hostHeader.toLowerCase();
    } else {
      reqHost = new URL(req.url).host.toLowerCase();
    }
  } catch {}

  const trustedHosts = getTrustedHosts(reqHost);

  function isTrusted(headerHost) {
    if (trustedHosts.has(headerHost) || trustedHosts.has(bareHost(headerHost))) return true;
    // fnOS gateway 常见场景：Host 为 localhost / Unix socket 内部名，但 Origin/Referer 是内网 NAS IP（任意端口）
    if (isLocalhost(reqHost) && isPrivateIPv4(headerHost)) return true;
    // 兜底：只要来源是内网私有 IP，就允许写操作（NAS 应用默认在内网使用）
    if (isPrivateIPv4(headerHost)) return true;
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
