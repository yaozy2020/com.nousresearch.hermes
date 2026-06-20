// @bun
// rate-limit.js — 简单令牌桶限流（v0.31.0）
//
// 设计：
//   - 基于 IP 的内存计数（重启后清零，足够防刷）
//   - 两档：通用 API（300/min）+ 鉴权失败专项（5/min，连续失败该 IP 锁 15min）
//   - 仅对 /api/* 启用，静态资源、ttyd 不限
//   - 失败次数也用同一桶累计
//
// 不持久化到 disk：fnOS 服务重启不频繁，重启清零是可接受的折衷；
// 真正需要持久化抗暴力时升级到 Redis/SQLite。

const GENERAL_WINDOW_MS = 60 * 1000;     // 1 分钟
const GENERAL_LIMIT = 300;               // 每 IP 每分钟 300 次

const AUTH_FAIL_WINDOW_MS = 60 * 1000;   // 1 分钟统计窗口
const AUTH_FAIL_LIMIT = 5;               // 连续 5 次失败
const AUTH_LOCK_MS = 15 * 60 * 1000;     // 锁 15 分钟

// ip -> { hits: number, windowStart: number }
const generalBuckets = new Map();
// ip -> { fails: number, windowStart: number, lockedUntil: number }
const authBuckets = new Map();

function now() { return Date.now(); }

function getClientIp(req) {
  // fnOS 网关会写 x-forwarded-for；Bun 原生 server 没有，回落到 host
  const xff = req.headers.get("x-forwarded-for") || "";
  if (xff) {
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/**
 * 通用 API 限流。
 * @returns null=放行；Response=已限流（429）
 */
export function checkGeneralLimit(req) {
  const ip = getClientIp(req);
  const t = now();
  const b = generalBuckets.get(ip);
  if (!b || t - b.windowStart >= GENERAL_WINDOW_MS) {
    generalBuckets.set(ip, { hits: 1, windowStart: t });
    return null;
  }
  b.hits += 1;
  if (b.hits > GENERAL_LIMIT) {
    return new Response(
      JSON.stringify({ ok: false, error: "rate_limit_exceeded", retry_after: Math.ceil((GENERAL_WINDOW_MS - (t - b.windowStart)) / 1000) }),
      { status: 429, headers: { "content-type": "application/json", "retry-after": "60" } }
    );
  }
  return null;
}

/** 鉴权前：检测 IP 是否被锁。 */
export function isAuthLocked(req) {
  const ip = getClientIp(req);
  const b = authBuckets.get(ip);
  if (!b) return false;
  if (b.lockedUntil && b.lockedUntil > now()) return true;
  // 锁过期，清掉
  if (b.lockedUntil && b.lockedUntil <= now()) {
    authBuckets.delete(ip);
  }
  return false;
}

/** 鉴权失败累加，超阈值 → 锁 IP。 */
export function recordAuthFailure(req) {
  const ip = getClientIp(req);
  const t = now();
  let b = authBuckets.get(ip);
  if (!b || t - b.windowStart >= AUTH_FAIL_WINDOW_MS) {
    b = { fails: 0, windowStart: t, lockedUntil: 0 };
  }
  b.fails += 1;
  if (b.fails >= AUTH_FAIL_LIMIT) {
    b.lockedUntil = t + AUTH_LOCK_MS;
  }
  authBuckets.set(ip, b);
  return b;
}

/** 鉴权成功：清掉该 IP 的失败计数。 */
export function recordAuthSuccess(req) {
  const ip = getClientIp(req);
  authBuckets.delete(ip);
}

/** 仅供测试：重置所有桶。 */
export function _resetAll() {
  generalBuckets.clear();
  authBuckets.clear();
}

/** 调试用：返回当前状态快照。 */
export function getStats() {
  return {
    generalActive: generalBuckets.size,
    authActive: authBuckets.size,
  };
}
