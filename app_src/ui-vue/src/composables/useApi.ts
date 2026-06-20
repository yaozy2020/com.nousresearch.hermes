/**
 * Hermes API 客户端
 * 优先从 <meta name="hermes-api-base"> 读取（由 index.html 启动脚本注入），
 * 回落到 URL 路径推断逻辑，兼容 fnOS 应用网关无尾斜杠场景。
 */

function getApiBase(): string {
  if (typeof window === 'undefined') return '/'
  // 1) 优先读取 meta 注入值（推荐路径）
  try {
    const meta = document.querySelector('meta[name="hermes-api-base"]') as HTMLMetaElement | null
    const v = meta?.content?.trim()
    if (v && v !== '/') return v.endsWith('/') ? v : v + '/'
  } catch {
    // 静默 fallback
  }
  // 2) 回落到 URL 推断
  const pn = window.location.pathname
  const m = pn.match(/^(\/app\/[^/]+)/)
  return m ? `${m[1]}/` : (pn.replace(/[^/]*$/, '') || '/')
}

export interface ApiOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const base = getApiBase()
  const cleanPath = String(path ?? '').replace(/^\/+/, '')

  let url = `${base}${cleanPath}`
  if (opts.params) {
    const sp = new URLSearchParams()
    Object.entries(opts.params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        sp.set(k, String(v))
      }
    })
    const qs = sp.toString()
    if (qs) url += `?${qs}`
  }

  const res = await fetch(url, opts)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export function escapeHtml(s: unknown): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return map[c] ?? c
  })
}
