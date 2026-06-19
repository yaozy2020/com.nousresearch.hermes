// @bun
// 日志读取、WebSocket 广播与结构化日志（支持按天轮转）
import { existsSync, readFileSync, appendFileSync, mkdirSync, readdirSync, unlinkSync, statSync } from "fs";
import { join } from "path";

const LOG_DIR = process.env.HERMES_LOG_DIR || `${process.env.HERMES_DATA_DIR || "/var/apps/com.nousresearch.hermes/home/data"}/logs`;
const MAX_LOG_DAYS = 7;

try {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
} catch (err) {
  console.error("[logger] create log dir failed:", err);
}

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
      } catch (err) {
        console.error("[logger] cleanup log failed:", path, err);
      }
    }
  } catch (err) {
    console.error("[logger] cleanup old logs failed:", err);
  }
}

export const wsClients = new Set();

const VALID_LEVELS = new Set(["error", "warn", "info", "debug"]);

/**
 * 写入结构化日志。
 * 兼容旧调用：log("info", ...args) -> source="panel"
 * 新调用：  log("gateway", "info", ...args) -> source="gateway"
 */
export function log(levelOrSource, ...args) {
  let source = "panel";
  let level = levelOrSource;
  if (!VALID_LEVELS.has(levelOrSource) && args.length > 0 && VALID_LEVELS.has(args[0])) {
    source = levelOrSource;
    level = args.shift();
  }
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}] [${source}]`;
  const line = [prefix, ...args].join(" ");
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  try {
    appendFileSync(getLogFileName(), line + "\n");
    cleanupOldLogs();
  } catch (err) {
    console.error("[logger] write log failed:", err);
  }
}

/**
 * 同时广播给前端并落盘。
 * 若 text 以 [source] 开头，自动解析为来源；否则 source=panel。
 */
export function broadcastLog(text) {
  const match = String(text).match(/^\[(\w+)\]\s*/);
  const source = match ? match[1] : "panel";
  const cleanText = match ? text.slice(match[0].length) : text;
  log(source, "info", cleanText);

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
