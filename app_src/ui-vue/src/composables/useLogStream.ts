/**
 * Hermes 日志流 composable
 * 通过 WebSocket 订阅 /api/logs/stream，把后端 broadcastLog 推过来的日志
 * 累积成响应式数组，供 UI 实时显示。
 */
import { ref, onUnmounted, type Ref } from 'vue'

function getApiBase(): string {
  if (typeof window === 'undefined') return '/'
  const pn = window.location.pathname
  const m = pn.match(/^(\/app\/[^/]+)/)
  return m ? `${m[1]}/` : pn.replace(/[^/]*$/, '')
}

export interface LogStreamHandle {
  lines: Ref<string[]>
  connected: Ref<boolean>
  start: () => void
  stop: () => void
  clear: () => void
}

export function useLogStream(maxLines = 500): LogStreamHandle {
  const lines = ref<string[]>([])
  const connected = ref(false)
  let ws: WebSocket | null = null
  let manualStop = false
  let retryTimer: ReturnType<typeof setTimeout> | null = null

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
  }

  onUnmounted(() => stop())

  return { lines, connected, start, stop, clear }
}
