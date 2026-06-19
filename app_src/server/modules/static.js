// @bun
// 静态文件服务（安全加固版）
import { existsSync, readFileSync, statSync } from "fs";
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

function fileResponse(filePath, contentType) {
  // 兼容 Bun 与 Node.js 测试环境
  if (typeof Bun !== "undefined" && Bun.file) {
    return new Response(Bun.file(filePath), {
      headers: { "Content-Type": contentType }
    });
  }
  return new Response(readFileSync(filePath), {
    headers: { "Content-Type": contentType }
  });
}

function isPathSafe(targetPath, staticDir) {
  // 必须位于 staticDir 下，且不含 NUL 字节
  if (targetPath.includes("\0")) return false;
  const resolved = resolve(targetPath);
  return resolved === staticDir || resolved.startsWith(staticDir + sep);
}

export function serveStatic(pathname, staticDir = STATIC_DIR) {
  // 去除可能的前导斜杠，统一基于 staticDir 解析
  const clean = pathname.replace(/^\/+/, "");

  // 根路径直接回退到 index.html（避免把 STATIC_DIR 目录当文件返回）
  if (clean === "") {
    const fallback = join(staticDir, "index.html");
    if (existsSync(fallback)) {
      return fileResponse(fallback, "text/html");
    }
    return new Response("Not found", { status: 404 });
  }

  const filePath = join(staticDir, clean);

  // 安全：目录穿越防护
  if (!isPathSafe(filePath, staticDir)) {
    return new Response("Forbidden", { status: 403 });
  }

  if (!existsSync(filePath)) {
    const fallback = join(staticDir, "index.html");
    if (existsSync(fallback)) {
      return fileResponse(fallback, "text/html");
    }
    return new Response("Not found", { status: 404 });
  }

  // 避免请求到目录时泄露目录存在性或抛出非 404 错误
  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) {
      return new Response("Not found", { status: 404 });
    }
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const ext = extname(filePath).toLowerCase();
  return fileResponse(filePath, MIME[ext] || "application/octet-stream");
}
