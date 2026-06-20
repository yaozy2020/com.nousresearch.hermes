// @bun
// 通用 HTTP 工具

// 把字符串里所有非 ASCII 字符转成 \uXXXX 转义，确保响应是纯 ASCII；
// 这样即使客户端 WebView 忽略 Content-Type 的 charset 提示（fnOS App 已观察到），
// 解析也不会乱码。代价：JSON 体略大，但对配置/状态接口完全可接受。
function asciiSafeStringify(data) {
  return JSON.stringify(data).replace(/[\u0080-\uffff]/g, (c) =>
    "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4)
  );
}

export function json(data, status = 200) {
  return new Response(asciiSafeStringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export async function parseBody(req) {
  const text = await req.text();
  if (!text) return {};
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Invalid JSON body");
    }
  }
  if (ct.includes("application/x-www-form-urlencoded")) {
    const out = {};
    for (const [k, v] of new URLSearchParams(text)) out[k] = v;
    return out;
  }
  return { raw: text };
}
