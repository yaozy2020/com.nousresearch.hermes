// @bun
// CSRF / 来源校验工具

function getClientIp(req) {
  const xff = req.headers.get("x-forwarded-for") || "";
  if (xff) {
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

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

function isPrivateHost(host) {
  return isLocalhost(host) || isPrivateIPv4(host);
}

function getExpectedHosts(req) {
  const expected = new Set();
  const hostHeader = req.headers.get("host");
  if (hostHeader) {
    expected.add(hostHeader.toLowerCase());
    expected.add(bareHost(hostHeader));
  }
  try {
    const urlHost = new URL(req.url).host;
    if (urlHost) {
      expected.add(urlHost.toLowerCase());
      expected.add(bareHost(urlHost));
    }
  } catch {}
  const env = process.env.HERMES_TRUSTED_HOSTS || "";
  for (const h of env.split(",")) {
    const host = h.trim();
    if (host) {
      expected.add(host.toLowerCase());
      expected.add(bareHost(host));
    }
  }
  return expected;
}

function hostIsTrusted(host, expectedHosts) {
  const h = host.toLowerCase();
  if (expectedHosts.has(h) || expectedHosts.has(bareHost(h))) return true;

  // 本地开发/调试场景：Host 是 localhost，但 Origin/Referer 是内网 IP
  for (const expected of expectedHosts) {
    if (isLocalhost(expected) && isPrivateIPv4(h)) return true;
  }

  return false;
}

function checkHeader(headerValue, expectedHosts) {
  if (!headerValue) return null;
  try {
    const host = new URL(headerValue).host;
    if (!host) return false;
    return hostIsTrusted(host, expectedHosts);
  } catch {
    return false;
  }
}

export function isSafeWriteRequest(req) {
  const method = req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const expectedHosts = getExpectedHosts(req);

  // Origin: null 是受限来源（sandbox iframe / 本地文件），写操作必须拒绝
  if (origin === "null") return false;

  if (origin) {
    const ok = checkHeader(origin, expectedHosts);
    if (ok === true) return true;
    if (ok === false) return false;
  }

  if (referer) {
    const ok = checkHeader(referer, expectedHosts);
    if (ok === true) return true;
    if (ok === false) return false;
  }

  // 既无 Origin 也无 Referer：仅允许本地/内网 IP，或带 API Token 的受信请求
  // 防止 curl/脚本直接调用 POST API 绕过 CSRF 保护
  const clientIp = getClientIp(req);
  if (isPrivateHost(clientIp)) return true;
  if (req.headers.get("authorization") || req.headers.get("x-hermes-token")) return true;
  return false;
}

// 用于需要额外 framing 保护的读端点（如 /ttyd*）
export function isSafeReadRequest(req) {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const expectedHosts = getExpectedHosts(req);

  // 有 Origin 时严格校验
  if (origin && origin !== "null") {
    return checkHeader(origin, expectedHosts) === true;
  }

  // 有 Referer 时严格校验
  if (referer) {
    return checkHeader(referer, expectedHosts) === true;
  }

  // 没有来源头时：仅允许本地/内网 IP 直接访问（如用户手动打开链接）
  // 外部脚本直接访问需带 API Token
  const clientIp = getClientIp(req);
  if (isPrivateHost(clientIp)) return true;
  if (req.headers.get("authorization") || req.headers.get("x-hermes-token")) return true;
  return false;
}
