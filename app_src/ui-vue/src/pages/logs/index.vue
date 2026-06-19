<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
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

const SOURCES = ['all', 'panel', 'gateway', 'dashboard', 'terminal'] as const
type Source = typeof SOURCES[number]

interface LogLine {
  raw: string
  source: string
}

const allLines = ref<LogLine[]>([])
const filter = ref<Source>('all')
const loading = ref(false)
const autoRefresh = ref(true)
const timer = ref<number | null>(null)

const sourceBadgeClass: Record<string, string> = {
  panel: 'bg-blue-500/20 text-blue-400',
  gateway: 'bg-emerald-500/20 text-emerald-400',
  dashboard: 'bg-purple-500/20 text-purple-400',
  terminal: 'bg-amber-500/20 text-amber-400',
}

function parseLine(raw: string): LogLine {
  const m = raw.match(/^\[\d{4}-\d{2}-\d{2}T[^\]]+\]\s*\[[^\]]+\]\s*\[([^\]]+)\]\s*/)
  return { raw, source: m ? m[1] : 'panel' }
}

const filteredLines = computed(() => {
  if (filter.value === 'all') return allLines.value
  return allLines.value.filter((l) => l.source === filter.value)
})

const logText = computed(() => {
  const lines = filteredLines.value.map((l) => l.raw)
  return lines.length ? lines.join('\n') : '暂无日志'
})

async function loadLogs(notifyOnSuccess = false) {
  loading.value = true
  try {
    const r = await api<LogResponse>('api/logs?lines=300')
    const lines = r.lines || []
    allLines.value = lines.map(parseLine)
    if (notifyOnSuccess) notify('日志已刷新', 'success')
  } catch (e: unknown) {
    const err = e as Error
    allLines.value = []
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

    <div class="flex flex-wrap items-center gap-2">
      <UBadge
        v-for="s in SOURCES"
        :key="s"
        :label="s === 'all' ? '全部' : s"
        :class="filter === s ? 'ring-2 ring-[var(--ui-primary)]' : 'cursor-pointer opacity-70 hover:opacity-100'"
        :color="filter === s ? 'primary' : 'neutral'"
        variant="soft"
        @click="filter = s"
      />
    </div>

    <UCard class="bg-[var(--ui-bg-card)] shadow-sm" :ui="{ root: 'ring-0 divide-y-0', body: '!p-0' }">
      <div class="p-4 text-xs font-mono whitespace-pre-wrap break-all max-h-[70vh] overflow-y-auto">
        <template v-if="filteredLines.length">
          <div v-for="(line, i) in filteredLines" :key="i" class="mb-1">
            <span class="px-1.5 py-0.5 rounded text-[10px] mr-2 align-middle" :class="sourceBadgeClass[line.source] || 'bg-neutral-500/20 text-neutral-400'">{{ line.source }}</span>
            <span class="text-[var(--ui-text-muted)]">{{ line.raw.replace(/^\[\d{4}-\d{2}-\d{2}T[^\]]+\]\s*\[[^\]]+\]\s*\[[^\]]+\]\s*/, '') }}</span>
          </div>
        </template>
        <template v-else>
          <span class="text-[var(--ui-text-muted)]">暂无日志</span>
        </template>
      </div>
    </UCard>
  </div>
</template>
