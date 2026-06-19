// @bun
// 静态文件服务（安全加固版）
import { existsSync, readFileSync } from "fs";
import { extname, join, resolve, sep } from "path";

const STATIC_DIR = resolve(process.env.STATIC_DIR || "./ui");

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".otf": "font/otf"
};

function isPathSafe(targetPath) {
  // 必须位于 STATIC_DIR 下，且不含 NUL 字节
  if (targetPath.includes("\0")) return false;
  const resolved = resolve(targetPath);
  return resolved === STATIC_DIR || resolved.startsWith(STATIC_DIR + sep);
}

export function serveStatic(pathname) {
  // 去除可能的前导斜杠，统一基于 STATIC_DIR 解析
  const clean = pathname.replace(/^\/+/, "");

  // 根路径直接回退到 index.html（避免把 STATIC_DIR 目录当文件返回）
  if (clean === "") {
    const fallback = join(STATIC_DIR, "index.html");
    if (existsSync(fallback)) {
      return new Response(Bun.file(fallback), {
        headers: { "Content-Type": "text/html" }
      });
    }
    return new Response("Not found", { status: 404 });
  }

  const filePath = join(STATIC_DIR, clean);

  // 安全：目录穿越防护
  if (!isPathSafe(filePath)) {
    return new Response("Forbidden", { status: 403 });
  }

  if (!existsSync(filePath)) {
    const fallback = join(STATIC_DIR, "index.html");
    if (existsSync(fallback)) {
      return new Response(Bun.file(fallback), {
        headers: { "Content-Type": "text/html" }
      });
    }
    return new Response("Not found", { status: 404 });
  }

  const ext = extname(filePath).toLowerCase();
  return new Response(Bun.file(filePath), {
    headers: { "Content-Type": MIME[ext] || "application/octet-stream" }
  });
}
