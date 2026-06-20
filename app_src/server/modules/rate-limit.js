// @bun
// rate-limit.js — 简单令牌桶限流（v0.31.0 + v0.31.2 持久化）
//
// 设计：
//   - 基于 IP 的内存计数，重启后通过 JSON 文件恢复（防暴力破解跨重启）
//   - 两档：通用 API（300/min）+ 鉴权失败专项（5/min，连续失败该 IP 锁 15min）
//   - 仅对 /api/* 启用，静态资源、ttyd 不限
//   - 失败次数也用同一桶累计
//
// 持久化策略：
//   - 每次修改桶后异步写入 ${HERMES_DATA_DIR}/rate-limit.json
//   - 启动时加载并清理过期条目（窗口期 + 锁定期）
//   - fnOS 服务重启不频繁，轻量 JSON 足够；高频场景可升级 SQLite/Redis

import { existsSync, readFileSync, writeFileSync, unlinkSync, statSync } from "fs";
import { join } from "path";

const GENERAL_WINDOW_MS = 60 * 1000;     // 1 分钟
const GENERAL_LIMIT = 300;               // 每 IP 每分钟 300 次

const AUTH_FAIL_WINDOW_MS = 60 * 1000;   // 1 分钟统计窗口
const AUTH_FAIL_LIMIT = 5;               // 连续 5 次失败
const AUTH_LOCK_MS = 15 * 60 * 1000;     // 锁 15 分钟

const DATA_DIR = process.env.HERMES_DATA_DIR || "/var/apps/com.nousresearch.hermes/home/data";
const PERSIST_FILE = join(DATA_DIR, "rate-limit.json");

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

function saveBuckets() {
  try {
    const data = {
      general: Array.from(generalBuckets.entries()),
      auth: Array.from(authBuckets.entries()),
      savedAt: now(),
    };
    writeFileSync(PERSIST_FILE, JSON.stringify(data), { mode: 0o600 });
  } catch {
    // 持久化失败不影响主流程
  }
}

function loadBuckets() {
  if (!existsSync(PERSIST_FILE)) return;
  try {
    const stat = statSync(PERSIST_FILE);
    const fileAge = now() - stat.mtimeMs;
    // 清理策略：文件超过 24 小时未修改且桶为空则删除，避免残留
    if (fileAge > 24 * 60 * 60 * 1000) {
      try { unlinkSync(PERSIST_FILE); } catch {}
      return;
    }
    const raw = readFileSync(PERSIST_FILE, "utf8");
    const data = JSON.parse(raw);
    const t = now();
    let hasValidData = false;
    // 恢复通用桶，清理过期
    for (const [ip, b] of (data.general || [])) {
      if (t - b.windowStart < GENERAL_WINDOW_MS) {
        generalBuckets.set(ip, b);
        hasValidData = true;
      }
    }
    // 恢复鉴权桶，清理过期
    for (const [ip, b] of (data.auth || [])) {
      if (b.lockedUntil && b.lockedUntil > t) {
        // 锁仍在有效期内
        authBuckets.set(ip, b);
        hasValidData = true;
      } else if (t - b.windowStart < AUTH_FAIL_WINDOW_MS) {
        // 窗口期内但锁已过期，重置失败计数
        authBuckets.set(ip, { fails: 0, windowStart: b.windowStart, lockedUntil: 0 });
        hasValidData = true;
      }
    }
    // 如果恢复后无有效数据且文件较旧，删除残留文件
    if (!hasValidData && fileAge > 1 * 60 * 60 * 1000) {
      try { unlinkSync(PERSIST_FILE); } catch {}
    }
  } catch {
    // 加载失败则从空状态开始
    try { unlinkSync(PERSIST_FILE); } catch {}
  }
}

// 启动时加载持久化数据
loadBuckets();

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
    saveBuckets();
    return new Response(
      JSON.stringify({ ok: false, error: "rate_limit_exceeded", retry_after: Math.ceil((GENERAL_WINDOW_MS - (t - b.windowStart)) / 1000) }),
      { status: 429, headers: { "content-type": "application/json", "retry-after": "60" } }
    );
  }
  saveBuckets();
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
  saveBuckets();
  return b;
}

/** 鉴权成功：清掉该 IP 的失败计数。 */
export function recordAuthSuccess(req) {
  const ip = getClientIp(req);
  authBuckets.delete(ip);
  saveBuckets();
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
