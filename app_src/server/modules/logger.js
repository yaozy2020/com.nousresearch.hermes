// @bun
// 日志读取、WebSocket 广播与结构化日志
import { existsSync, readFileSync, appendFileSync, mkdirSync } from "fs";

const LOG_DIR = process.env.HERMES_LOG_DIR || `${process.env.HERMES_DATA_DIR || "/var/apps/com.nousresearch.hermes/home/data"}/logs`;
const LOG_FILE = `${LOG_DIR}/gateway.log`;

try {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
} catch {}

export const wsClients = new Set();

export function log(level, ...args) {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
  const line = [prefix, ...args].join(" ");
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  try { appendFileSync(LOG_FILE, line + "\n"); } catch {}
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
  const logFile = `${LOG_DIR}/gateway.log`;
  if (!existsSync(logFile)) return { lines: [] };
  const content = readFileSync(logFile, "utf-8");
  const allLines = content.split("\n");
  return { lines: allLines.slice(-lines) };
}
