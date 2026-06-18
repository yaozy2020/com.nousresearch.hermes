<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { api } from '@/composables/useApi'

interface LogResponse {
  lines?: string[]
}

const toast = useToast()
function notify(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') {
  const color = type === 'error' ? 'error' : type === 'warning' ? 'warning' : type === 'success' ? 'success' : 'neutral'
  const icon = type === 'error' ? 'i-lucide-x-circle' : type === 'warning' ? 'i-lucide-alert-triangle' : type === 'success' ? 'i-lucide-check-circle' : 'i-lucide-info'
  toast.add({ title: message, color, icon })
}

const logText = ref('')
const loading = ref(false)
const autoRefresh = ref(true)
const timer = ref<number | null>(null)

async function loadLogs(notifyOnSuccess = false) {
  loading.value = true
  try {
    const r = await api<LogResponse>('api/logs?lines=300')
    const lines = r.lines || []
    logText.value = lines.length ? lines.join('\n') : '暂无日志'
    if (notifyOnSuccess) notify('日志已刷新', 'success')
  } catch (e: unknown) {
    const err = e as Error
    logText.value = '日志读取失败'
    if (notifyOnSuccess) notify('日志读取失败: ' + (err?.message ?? String(e)), 'error')
  } finally {
    loading.value = false
  }
}

function copyLogs() {
  navigator.clipboard.writeText(logText.value).then(() => {
    notify('日志已复制', 'success')
  }).catch(() => {
    notify('复制失败', 'error')
  })
}

onMounted(() => {
  loadLogs()
  timer.value = window.setInterval(() => {
    if (autoRefresh.value) loadLogs()
  }, 3000)
})

onUnmounted(() => {
  if (timer.value) window.clearInterval(timer.value)
})
</script>

<template>
  <div class="mx-auto space-y-6">
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 class="text-3xl font-bold text-[var(--ui-text)]">日志</h1>
        <p class="text-[var(--ui-text-muted)] mt-2">Gateway / Dashboard / 终端运行日志</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UCheckbox v-model="autoRefresh" label="自动刷新" />
        <UButton color="neutral" variant="outline" icon="i-lucide-copy" @click="copyLogs">复制</UButton>
        <UButton color="primary" variant="outline" icon="i-lucide-refresh-cw" :loading="loading" @click="loadLogs(true)">刷新</UButton>
      </div>
    </div>

    <UCard class="bg-[var(--ui-bg-card)] shadow-sm" :ui="{ root: 'ring-0 divide-y-0', body: '!p-0' }">
      <pre class="p-4 text-xs font-mono text-[var(--ui-text-muted)] whitespace-pre-wrap break-all max-h-[70vh] overflow-y-auto">{{ logText }}</pre>
    </UCard>
  </div>
</template>
