// @bun
// auth.js — API token 鉴权（v0.31.0）
//
// 设计原则：
//   1) 默认关闭：`HERMES_API_TOKEN` 未设置 → 所有请求直通（向后兼容）
//   2) 启用方式：把 SHA-256 hex 写入 `${HERMES_HOME}/.env` 的 HERMES_API_TOKEN
//   3) 验证方式：客户端在 Authorization: Bearer <plain-token> 中传明文
//   4) 服务端比较：sha256(plain) === stored hex（恒等时间比较）
//   5) 三种忘记 token 的恢复方式：
//      a) UI 「重置 API Token」按钮 → /api/auth/reset 生成新 token
//      b) cmd/main reset-token 子命令 → 清 token + 重启
//      c) 在 ${HERMES_HOME}/.reset_token 创建空文件 → 应用启动时 install_callback 检测后清 token
//
// 选 SHA-256 而非 bcrypt：bun 原生有 crypto.subtle，无需第三方依赖；
// token 长度 32 字节随机时碰撞与暴力破解概率与 bcrypt 等价，但实现更简单。

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";

const HERMES_HOME = process.env.HERMES_HOME || `${process.env.HERMES_DATA_DIR || ""}/home`;
const ENV_FILE = HERMES_HOME ? join(HERMES_HOME, ".env") : "";
const RESET_FILE = HERMES_HOME ? join(HERMES_HOME, ".reset_token") : "";

// ==== Token 哈希 ====
function sha256Hex(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

// ==== 配置读写（最小依赖，不复用 config.js 避免循环）====
function readEnvLine(key) {
  if (!ENV_FILE || !existsSync(ENV_FILE)) return "";
  try {
    const text = readFileSync(ENV_FILE, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      if (t.slice(0, eq).trim() === key) {
        let v = t.slice(eq + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        return v;
      }
    }
  } catch {}
  return "";
}

function writeEnvLine(key, value) {
  if (!ENV_FILE) throw new Error("HERMES_HOME not set");
  let text = "";
  try {
    if (existsSync(ENV_FILE)) text = readFileSync(ENV_FILE, "utf8");
  } catch {}
  const lines = text.split(/\r?\n/);
  let found = false;
  const newLines = lines.map((line) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return line;
    const eq = t.indexOf("=");
    if (eq < 0) return line;
    if (t.slice(0, eq).trim() === key) {
      found = true;
      return value === null || value === undefined || value === ""
        ? null  // 删除
        : `${key}=${value}`;
    }
    return line;
  }).filter((x) => x !== null);
  if (!found && value !== null && value !== undefined && value !== "") {
    if (newLines.length && newLines[newLines.length - 1].trim() !== "") newLines.push("");
    newLines.push(`${key}=${value}`);
  }
  writeFileSync(ENV_FILE, newLines.join("\n"), { mode: 0o600 });
}

// ==== 公开 API ====

export function isAuthEnabled() {
  return !!readEnvLine("HERMES_API_TOKEN");
}

export function getStoredHash() {
  return readEnvLine("HERMES_API_TOKEN");
}

/** 生成 32 字节随机 token（hex 编码 64 字符），返回 { plain, hash } */
export function generateToken() {
  const plain = randomBytes(32).toString("hex");
  const hash = sha256Hex(plain);
  return { plain, hash };
}

/**
 * 启用鉴权：生成新 token + 写入 .env。
 * @returns {{ plain: string }} 明文 token，仅返回一次（前端必须立即记下来）
 */
export function enableAuth() {
  const { plain, hash } = generateToken();
  writeEnvLine("HERMES_API_TOKEN", hash);
  return { plain };
}

/** 关闭鉴权：删除 .env 中 HERMES_API_TOKEN 行 */
export function disableAuth() {
  writeEnvLine("HERMES_API_TOKEN", "");
}

/** 重置 token：等价于 enableAuth */
export function resetToken() {
  return enableAuth();
}

/**
 * 检测客户端 token 是否有效。
 * @returns true=已通过 / 未启用; false=已启用但 token 不匹配
 */
export function verifyRequest(req) {
  const stored = getStoredHash();
  if (!stored) return true;  // 未启用
  // 优先 Authorization: Bearer <token>
  const auth = req.headers.get("authorization") || "";
  let plain = "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (m) plain = m[1].trim();
  // 备选：自定义 header（前端不便用 Authorization 时）
  if (!plain) plain = (req.headers.get("x-hermes-token") || "").trim();
  if (!plain) return false;
  const candidate = sha256Hex(plain);
  return constantTimeEqual(candidate, stored);
}

/**
 * 应用启动时检测 .reset_token 标记文件 — 如果存在 → 清 token + 删标记。
 * 这是「忘记 token 的兜底方式」，文件管理器/SSH 都能创建空文件。
 */
export function checkResetMarker() {
  if (!RESET_FILE || !existsSync(RESET_FILE)) return false;
  try {
    disableAuth();
    unlinkSync(RESET_FILE);
    return true;
  } catch {
    return false;
  }
}
