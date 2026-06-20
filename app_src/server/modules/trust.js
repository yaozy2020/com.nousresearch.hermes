// @bun
// 用户自定义 SHA256 信任清单
// data/trusted_hashes.txt，一行一个 sha256 hex。
// 安装 hermes-agent 时（cmd/install_callback 走 hermes_install.sh）可校验下载文件 sha256。
// 当前 server 提供 list/add/delete API + 校验工具函数。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { log } from "./logger.js";

const DATA_DIR = process.env.HERMES_DATA_DIR || "/var/apps/com.nousresearch.hermes/home/data";
const FILE = join(DATA_DIR, "trusted_hashes.txt");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true, mode: 0o750 });
}

function isValidHash(h) {
  return typeof h === "string" && /^[0-9a-fA-F]{64}$/.test(h);
}

export function listTrustedHashes() {
  if (!existsSync(FILE)) return [];
  const text = readFileSync(FILE, "utf-8");
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#") && isValidHash(s));
}

export function addTrustedHash(h) {
  ensureDataDir();
  if (!isValidHash(h)) return { ok: false, error: "invalid hash (need 64 hex chars)" };
  const norm = h.toLowerCase();
  const cur = listTrustedHashes();
  if (cur.includes(norm)) return { ok: false, error: "already trusted" };
  cur.push(norm);
  writeFileSync(FILE, cur.join("\n") + "\n", { mode: 0o640 });
  log("info", "trusted hash added", norm.slice(0, 8) + "…");
  return { ok: true };
}

export function deleteTrustedHash(h) {
  if (!isValidHash(h)) return { ok: false, error: "invalid hash" };
  const norm = h.toLowerCase();
  const cur = listTrustedHashes();
  const idx = cur.indexOf(norm);
  if (idx < 0) return { ok: false, error: "not found" };
  cur.splice(idx, 1);
  writeFileSync(FILE, cur.length ? cur.join("\n") + "\n" : "", { mode: 0o640 });
  log("info", "trusted hash deleted", norm.slice(0, 8) + "…");
  return { ok: true };
}

// 给 hermes 安装流程使用：true=可信，false=不可信，null=未启用清单
export function checkTrust(hash) {
  if (!existsSync(FILE)) return null;
  const cur = listTrustedHashes();
  if (cur.length === 0) return null;
  return cur.includes((hash || "").toLowerCase());
}
