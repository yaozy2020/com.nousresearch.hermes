// @bun
// 统一错误处理与日志辅助

import { log } from "./logger.js";

/**
 * 记录可恢复错误，避免空 catch 吞掉异常。
 * 用于那些"失败不影响主流程"的场景，比如清理 PID 文件、关闭连接等。
 */
export function swallowError(context, err) {
  const message = err instanceof Error ? err.message : String(err);
  log("warn", `[swallow] ${context}: ${message}`);
}

/**
 * 统一 API 错误响应格式。
 */
export function errorResponse(error, code = null, status = 500) {
  const body = { ok: false, error };
  if (code) body.code = code;
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
