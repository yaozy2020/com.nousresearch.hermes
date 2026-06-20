// @bun
// Backup / Restore：把用户数据（home/.env、home/config.yaml、home/.hermes-config）
// 打包到 data/backups/<id>.tar.gz，提供 list / create / restore / delete API。
// 用户安装包升级或者卸载后重装时可以一键还原。
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import { dirname, join, basename } from "path";
import { spawnSync } from "child_process";
import { log } from "./logger.js";

const DATA_DIR = process.env.HERMES_DATA_DIR || "/var/apps/com.nousresearch.hermes/home/data";
const HERMES_HOME = process.env.HERMES_HOME || `${DATA_DIR}/home`;
const BACKUP_DIR = `${DATA_DIR}/backups`;

// 保留位 — 仅备份这些路径（相对 HERMES_HOME），避免误备 venv / cache。
const BACKUP_INCLUDES = [".env", "config.yaml", ".hermes-config", "channels"];

function ensureBackupDir() {
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o750 });
}

function safeId(id) {
  // 只允许 [A-Za-z0-9._-]，避免路径穿越
  return /^[A-Za-z0-9._-]+$/.test(id);
}

export function listBackups() {
  ensureBackupDir();
  if (!existsSync(BACKUP_DIR)) return [];
  return readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith(".tar.gz"))
    .map((f) => {
      const p = join(BACKUP_DIR, f);
      const st = statSync(p);
      return {
        id: f.replace(/\.tar\.gz$/, ""),
        size: st.size,
        mtime: st.mtimeMs,
      };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

export function createBackup() {
  ensureBackupDir();
  if (!existsSync(HERMES_HOME)) {
    return { ok: false, error: "HERMES_HOME not found: " + HERMES_HOME };
  }
  // 时间戳精确到毫秒，避免同一秒内多次创建相互覆盖
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 23);
  const id = `backup_${ts}`;
  const out = join(BACKUP_DIR, `${id}.tar.gz`);

  // 构造仅打包子集的 tar 命令
  const args = ["-czf", out, "-C", HERMES_HOME];
  let added = 0;
  for (const item of BACKUP_INCLUDES) {
    if (existsSync(join(HERMES_HOME, item))) {
      args.push(item);
      added++;
    }
  }
  if (added === 0) {
    return { ok: false, error: "no backup-eligible items found in HERMES_HOME" };
  }

  const r = spawnSync("tar", args, { encoding: "utf-8" });
  if (r.status !== 0) {
    log("error", "backup tar failed:", r.stderr);
    return { ok: false, error: r.stderr || "tar failed" };
  }
  log("info", "backup created", id);
  return { ok: true, id, path: out, size: existsSync(out) ? statSync(out).size : 0 };
}

export function restoreBackup(id) {
  if (!safeId(id)) return { ok: false, error: "invalid backup id" };
  const file = join(BACKUP_DIR, `${id}.tar.gz`);
  if (!existsSync(file)) return { ok: false, error: "backup not found" };
  if (!existsSync(HERMES_HOME)) mkdirSync(HERMES_HOME, { recursive: true });

  // 先备份当前状态再恢复，保险起见
  const safetyId = `pre-restore_${Date.now()}`;
  try { createBackup(); } catch {}

  const r = spawnSync("tar", ["-xzf", file, "-C", HERMES_HOME], { encoding: "utf-8" });
  if (r.status !== 0) {
    log("error", "restore tar failed:", r.stderr);
    return { ok: false, error: r.stderr || "tar extract failed" };
  }
  log("info", "backup restored", id);
  return { ok: true, id, restoredFrom: file, safetyBackup: safetyId };
}

export function deleteBackup(id) {
  if (!safeId(id)) return { ok: false, error: "invalid backup id" };
  const file = join(BACKUP_DIR, `${id}.tar.gz`);
  if (!existsSync(file)) return { ok: false, error: "backup not found" };
  unlinkSync(file);
  log("info", "backup deleted", id);
  return { ok: true };
}
