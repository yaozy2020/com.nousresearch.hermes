// hermes/proc-utils.js
// 进程相关工具函数：端口占用检测、PID 存活检测、运行时长格式化等
import { readFileSync, existsSync, mkdirSync } from "fs";
import { createServer } from "net";
import { LOG_DIR, RUNTIME_DIR } from "./paths.js";

// 模块顶层 mkdir 是历史遗留：测试导入此模块时也会触发，
// 因此用 try/catch 静默 EACCES，正式启动由 index.js 显式初始化。
for (const d of [LOG_DIR, RUNTIME_DIR]) {
  try {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  } catch { /* test env may lack write perm */ }
}

let _hermesInited = false;
export function initHermesModule() {
  if (_hermesInited) return;
  _hermesInited = true;
  for (const d of [LOG_DIR, RUNTIME_DIR]) {
    try {
      if (!existsSync(d)) mkdirSync(d, { recursive: true });
    } catch { /* logger will surface error if perms truly missing */ }
  }
}

export function isPortInUse(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", (err) => {
      resolve(err.code === "EADDRINUSE");
    });
    server.once("listening", () => {
      server.close(() => resolve(false));
    });
    server.listen(port, host);
  });
}

export function isProcessAlive(pid, expectedName = null) {
  if (!pid || isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  if (!expectedName) return true;
  try {
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf-8");
    // /proc/PID/cmdline 中参数以 \0 分隔
    return cmdline.includes(expectedName);
  } catch {
    return true; // 无法读取时保守认为存活，避免误杀
  }
}

// 进程启动时间登记表：由 gateway/dashboard 启动时写入
export const processStartTimes = new Map();

export function getProcessUptime(pid) {
  if (!pid) return null;
  const started = processStartTimes.get(pid);
  if (started) {
    const seconds = Math.floor((Date.now() - started) / 1000);
    return seconds;
  }
  return null;
}

export function formatUptime(seconds) {
  if (seconds === null || seconds === undefined) return null;
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return `${h}h ${rm}m`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return `${d}d ${rh}h`;
}
