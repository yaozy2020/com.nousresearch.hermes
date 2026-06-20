/**
 * Hermes 日志流 composable
 * 通过 WebSocket 订阅 /api/logs/stream，把后端 broadcastLog 推过来的日志
 * 累积成响应式数组，供 UI 实时显示。
 *
 * v0.30: 增加 alerts 流（仅 warn/error 级别），供上层弹 toast 用。
 */
import { ref, onUnmounted, type Ref } from 'vue'

function getApiBase(): string {
  if (typeof window === 'undefined') return '/'
  try {
    const meta = document.querySelector('meta[name="hermes-api-base"]') as HTMLMetaElement | null
    const v = meta?.content?.trim()
    if (v && v !== '/') return v.endsWith('/') ? v : v + '/'
  } catch { /* ignore */ }
  const pn = window.location.pathname
  const m = pn.match(/^(\/app\/[^/]+)/)
  return m ? `${m[1]}/` : (pn.replace(/[^/]*$/, '') || '/')
}

export interface LogAlert {
  level: 'warn' | 'error'
  text: string
  source: string
  code?: string
  ts: number
}

export interface LogStreamHandle {
  lines: Ref<string[]>
  alerts: Ref<LogAlert[]>
  connected: Ref<boolean>
  start: () => void
  stop: () => void
  clear: () => void
  onAlert: (cb: (a: LogAlert) => void) => () => void
}

export function useLogStream(maxLines = 500): LogStreamHandle {
  const lines = ref<string[]>([])
  const alerts = ref<LogAlert[]>([])
  const connected = ref(false)
  let ws: WebSocket | null = null
  let manualStop = false
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  const alertSubs = new Set<(a: LogAlert) => void>()

  function emitAlert(a: LogAlert) {
    alerts.value.push(a)
    if (alerts.value.length > 50) alerts.value.splice(0, alerts.value.length - 50)
    for (const cb of alertSubs) {
      try { cb(a) } catch { /* ignore */ }
    }
  }

  function connect() {
    if (ws && ws.readyState !== WebSocket.CLOSED) return
    const base = getApiBase()
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}${base}api/logs/stream`
    try {
      ws = new WebSocket(wsUrl)
      ws.onopen = () => { connected.value = true }
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg && msg.type === 'log' && typeof msg.data === 'string') {
            // 按 \n 拆行追加
            const parts = msg.data.split(/\r?\n/).filter(Boolean)
            for (const p of parts) lines.value.push(p)
            if (lines.value.length > maxLines) {
              lines.value.splice(0, lines.value.length - maxLines)
            }
            // v0.30: warn / error 级别 → 抛 alert 给 UI 弹 toast
            if (msg.level === 'warn' || msg.level === 'error') {
              emitAlert({
                level: msg.level,
                text: String(msg.data),
                source: typeof msg.source === 'string' ? msg.source : 'panel',
                code: typeof msg.code === 'string' ? msg.code : undefined,
                ts: Date.now()
              })
            }
          }
        } catch {
          // 忽略非 JSON
        }
      }
      ws.onclose = () => {
        connected.value = false
        if (!manualStop) {
          retryTimer = setTimeout(connect, 2000)
        }
      }
      ws.onerror = () => {
        try { ws?.close() } catch {}
      }
    } catch (e) {
      // 自动 2s 后重试
      if (!manualStop) retryTimer = setTimeout(connect, 2000)
    }
  }

  function start() {
    manualStop = false
    connect()
  }

  function stop() {
    manualStop = true
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
    try { ws?.close() } catch {}
    ws = null
    connected.value = false
  }

  function clear() {
    lines.value = []
    alerts.value = []
  }

  function onAlert(cb: (a: LogAlert) => void): () => void {
    alertSubs.add(cb)
    return () => alertSubs.delete(cb)
  }

  onUnmounted(() => stop())

  return { lines, alerts, connected, start, stop, clear, onAlert }
}
