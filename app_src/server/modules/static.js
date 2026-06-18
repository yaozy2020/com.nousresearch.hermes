// @bun
// 静态文件服务
import { existsSync, readFileSync } from "fs";
import { extname, join, normalize } from "path";

const STATIC_DIR = process.env.STATIC_DIR || "./ui";

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

export function serveStatic(pathname) {
  const safe = normalize(pathname).replace(/^(\.\.[\/\\])+/, "");
  const filePath = join(STATIC_DIR, safe === "/" ? "index.html" : safe);
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
