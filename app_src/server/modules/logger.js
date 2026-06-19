// @bun
// 日志读取、WebSocket 广播与结构化日志（支持按天轮转）
import { existsSync, readFileSync, appendFileSync, mkdirSync, readdirSync, unlinkSync, statSync } from "fs";
import { join } from "path";

const LOG_DIR = process.env.HERMES_LOG_DIR || `${process.env.HERMES_DATA_DIR || "/var/apps/com.nousresearch.hermes/home/data"}/logs`;
const MAX_LOG_DAYS = 7;

try {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
} catch {}

function getLogFileName(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return join(LOG_DIR, `gateway-${y}-${m}-${d}.log`);
}

function cleanupOldLogs() {
  try {
    const entries = readdirSync(LOG_DIR);
    const now = Date.now();
    const maxAgeMs = MAX_LOG_DAYS * 24 * 60 * 60 * 1000;
    for (const name of entries) {
      if (!name.startsWith("gateway-") || !name.endsWith(".log")) continue;
      const path = join(LOG_DIR, name);
      try {
        const stat = statSync(path);
        if (now - stat.mtimeMs > maxAgeMs) {
          unlinkSync(path);
        }
      } catch {}
    }
  } catch {}
}

export const wsClients = new Set();

export function log(level, ...args) {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
  const line = [prefix, ...args].join(" ");
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  try {
    appendFileSync(getLogFileName(), line + "\n");
    cleanupOldLogs();
  } catch {}
}

export function broadcastLog(text) {
  const msg = JSON.stringify({ type: "log", data: text });
  for (const ws of wsClients) {
    try {
      if (ws.readyState === 1) ws.send(msg);
    } catch {
      wsClients.delete(ws);
    }
  }
}

export function readLogs(lines = 200) {
  // 读取当天日志；若不足则合并前一天日志，保证连续性
  const todayFile = getLogFileName();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayFile = getLogFileName(yesterday);

  let content = "";
  if (existsSync(yesterdayFile)) {
    content += readFileSync(yesterdayFile, "utf-8");
  }
  if (existsSync(todayFile)) {
    content += readFileSync(todayFile, "utf-8");
  }

  if (!content) return { lines: [] };
  const allLines = content.split("\n");
  return { lines: allLines.slice(-lines) };
}
