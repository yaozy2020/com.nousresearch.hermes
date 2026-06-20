// @bun
// Provider Marketplace：管理 user 自定义 providers，叠加到内置 providers.json。
// 数据落地到 data/providers.json，server 启动时会自动用它覆盖内置。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { log } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILTIN_PATH = join(__dirname, "providers.json");
const DATA_DIR = process.env.HERMES_DATA_DIR || "/var/apps/com.nousresearch.hermes/home/data";
const USER_PATH = join(DATA_DIR, "providers.json");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true, mode: 0o750 });
}

function loadJson(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf-8")); }
  catch (e) { log("error", "providers json parse failed", path, e.message); return null; }
}

export function getEffectiveProviders() {
  const builtin = loadJson(BUILTIN_PATH) || { presets: [] };
  const user = loadJson(USER_PATH);
  if (!user || !Array.isArray(user.presets)) {
    return { source: "builtin", ...builtin };
  }
  // user 覆盖：name 相同则 user 胜出，新增的追加到末尾
  const map = new Map();
  (builtin.presets || []).forEach((p) => map.set(p.name, p));
  (user.presets || []).forEach((p) => map.set(p.name, p));
  return { source: "merged", presets: Array.from(map.values()) };
}

export function getUserProviders() {
  const u = loadJson(USER_PATH);
  return u && Array.isArray(u.presets) ? u.presets : [];
}

function isValidProvider(p) {
  if (!p || typeof p !== "object") return false;
  if (typeof p.name !== "string" || !p.name.trim()) return false;
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(p.name)) return false;
  if (typeof p.label !== "string" || !p.label.trim()) return false;
  if (typeof p.base_url !== "string" || !p.base_url.startsWith("http")) return false;
  if (typeof p.env_key !== "string" || !/^[A-Z][A-Z0-9_]*_API_KEY$/.test(p.env_key)) return false;
  return true;
}

function isReservedName(name) {
  const builtin = loadJson(BUILTIN_PATH) || { presets: [] };
  return (builtin.presets || []).some((p) => p.name === name);
}

export function addUserProvider(p) {
  ensureDataDir();
  if (!isValidProvider(p)) return { ok: false, error: "invalid provider payload" };
  if (isReservedName(p.name)) return { ok: false, error: "name conflicts with builtin provider" };
  const cur = loadJson(USER_PATH) || { presets: [] };
  if ((cur.presets || []).some((x) => x.name === p.name)) {
    return { ok: false, error: "duplicate user provider name" };
  }
  const safeProvider = {
    name: p.name,
    label: p.label,
    base_url: p.base_url,
    env_key: p.env_key,
    docs: typeof p.docs === "string" ? p.docs : "",
    note: typeof p.note === "string" ? p.note : "",
    user: true,
  };
  cur.presets = [...(cur.presets || []), safeProvider];
  writeFileSync(USER_PATH, JSON.stringify(cur, null, 2), { mode: 0o640 });
  log("info", "user provider added", p.name);
  return { ok: true, provider: safeProvider };
}

export function deleteUserProvider(name) {
  ensureDataDir();
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(name)) return { ok: false, error: "invalid name" };
  const cur = loadJson(USER_PATH) || { presets: [] };
  const before = (cur.presets || []).length;
  cur.presets = (cur.presets || []).filter((x) => x.name !== name);
  if (cur.presets.length === before) {
    return { ok: false, error: "user provider not found" };
  }
  writeFileSync(USER_PATH, JSON.stringify(cur, null, 2), { mode: 0o640 });
  log("info", "user provider deleted", name);
  return { ok: true };
}
