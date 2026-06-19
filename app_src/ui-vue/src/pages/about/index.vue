<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/composables/useApi'

interface VersionInfo {
  panel?: string
  hermes?: string
  dashboard?: string
  venv?: string
  dataDir?: string
}

const toast = useToast()
function notify(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') {
  const color = type === 'error' ? 'error' : type === 'warning' ? 'warning' : type === 'success' ? 'success' : 'neutral'
  const icon = type === 'error' ? 'i-lucide-x-circle' : type === 'warning' ? 'i-lucide-alert-triangle' : type === 'success' ? 'i-lucide-check-circle' : 'i-lucide-info'
  toast.add({ title: message, color, icon })
}

const version = ref<VersionInfo>({})
const currentTheme = ref('blue')

interface ThemeDef {
  id: string
  name: string
  color: string
  dim: string
  soft: string
  forceDark: boolean
}

const themes: ThemeDef[] = [
  { id: 'blue', name: '天空蓝', color: '#2173DF', dim: '#1a5cb5', soft: 'rgba(33, 115, 223, 0.10)', forceDark: false },
  { id: 'orange', name: '落日橙', color: '#ff7f16', dim: '#cc6612', soft: 'rgba(255, 127, 22, 0.10)', forceDark: false },
  { id: 'violet', name: '星云紫', color: '#8b5cf6', dim: '#7c3aed', soft: 'rgba(139, 92, 246, 0.10)', forceDark: false },
  { id: 'cyan', name: '极光青', color: '#06b6d4', dim: '#0891b2', soft: 'rgba(6, 182, 212, 0.10)', forceDark: false },
  { id: 'rose', name: '玫瑰红', color: '#f43f5e', dim: '#e11d48', soft: 'rgba(244, 63, 94, 0.10)', forceDark: false },
  { id: 'dark', name: '强制深色', color: '#818cf8', dim: '#6366f1', soft: 'rgba(129, 140, 248, 0.12)', forceDark: true },
]

async function loadVersion() {
  try {
    version.value = await api<VersionInfo>('api/version')
  } catch {
    // ignore
  }
}

function applyThemeColor(color: string, dim: string) {
  const root = document.documentElement
  // 覆盖 Nuxt UI / Tailwind 主色，让按钮、链接、文字高亮都跟着变
  root.style.setProperty('--color-fnui-500', color)
  root.style.setProperty('--color-fnui-600', dim)
  root.style.setProperty('--color-fnui-400', color)
  root.style.setProperty('--color-fnui-700', dim)
  // 保留旧变量兼容
  root.style.setProperty('--brand-color', color)
  root.style.setProperty('--brand-color-dim', dim)
}

function setTheme(name: string, silent = false) {
  const t = themes.find(x => x.id === name)
  if (!t) return

  applyThemeColor(t.color, t.dim)
  document.documentElement.style.setProperty('--brand-color-soft', t.soft)

  if (t.forceDark) {
    document.documentElement.classList.add('dark')
    document.body.setAttribute('theme-mode', 'dark')
  } else {
    const mode = localStorage.getItem('fnos-theme-mode') || ''
    if (mode === 'dark') {
      document.documentElement.classList.add('dark')
      document.body.setAttribute('theme-mode', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      document.body.removeAttribute('theme-mode')
    }
  }

  currentTheme.value = name
  try { localStorage.setItem('hermes-theme', name) } catch {}
  if (!silent) notify(`已切换为 ${t.name}`, 'success')
}

onMounted(() => {
  loadVersion()
  try {
    const saved = localStorage.getItem('hermes-theme')
    if (saved && themes.some(t => t.id === saved)) {
      currentTheme.value = saved
      setTheme(saved, true)
    }
  } catch {}
})
</script>

<template>
  <div class="mx-auto space-y-6">
    <div>
      <h1 class="text-3xl font-bold text-[var(--ui-text)]">关于</h1>
      <p class="text-[var(--ui-text-muted)] mt-2">版本与主题设置</p>
    </div>

    <UCard class="bg-[var(--ui-bg-card)] shadow-sm" :ui="{ root: 'ring-0 divide-y-0', body: 'p-5' }">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-info" class="w-5 h-5 text-primary" />
          <span class="font-semibold text-[var(--ui-text)]">版本信息</span>
        </div>
      </template>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div class="border-b border-[var(--ui-border)] pb-2">
          <div class="text-[var(--ui-text-muted)] mb-0.5">Panel</div>
          <div class="font-mono text-[var(--ui-text)] break-all">{{ version.panel || '-' }}</div>
        </div>
        <div class="border-b border-[var(--ui-border)] pb-2">
          <div class="text-[var(--ui-text-muted)] mb-0.5">Hermes</div>
          <div class="font-mono text-[var(--ui-text)] break-all">{{ version.hermes || '-' }}</div>
        </div>
        <div class="border-b border-[var(--ui-border)] pb-2">
          <div class="text-[var(--ui-text-muted)] mb-0.5">Dashboard</div>
          <div class="font-mono text-[var(--ui-text)] break-all">{{ version.dashboard || '-' }}</div>
        </div>
        <div class="border-b border-[var(--ui-border)] pb-2">
          <div class="text-[var(--ui-text-muted)] mb-0.5">Venv</div>
          <div class="font-mono text-[var(--ui-text)] break-all">{{ version.venv || '-' }}</div>
        </div>
        <div class="border-b border-[var(--ui-border)] pb-2">
          <div class="text-[var(--ui-text-muted)] mb-0.5">数据目录</div>
          <div class="font-mono text-[var(--ui-text)] break-all">{{ version.dataDir || '-' }}</div>
        </div>
      </div>
    </UCard>

    <UCard class="bg-[var(--ui-bg-card)] shadow-sm" :ui="{ root: 'ring-0 divide-y-0', body: 'p-5' }">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-palette" class="w-5 h-5 text-primary" />
          <span class="font-semibold text-[var(--ui-text)]">主题色</span>
        </div>
      </template>
      <div class="flex flex-wrap gap-3">
        <button
          v-for="t in themes"
          :key="t.id"
          class="w-10 h-10 rounded-full border-2 transition-transform hover:scale-110"
          :class="currentTheme === t.id ? 'border-[var(--ui-text)]' : 'border-transparent'"
          :style="{ background: t.color }"
          :title="t.name"
          @click="setTheme(t.id)"
        />
      </div>
    </UCard>

    <UCard class="bg-[var(--ui-bg-card)] shadow-sm" :ui="{ root: 'ring-0 divide-y-0', body: 'p-5' }">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-book-open" class="w-5 h-5 text-primary" />
          <span class="font-semibold text-[var(--ui-text)]">关于 Hermes</span>
        </div>
      </template>
      <p class="text-sm text-[var(--ui-text-muted)]">
        Hermes 是 Nous Research 开发的自进化 AI Agent 平台。本面板专注进程管理与首次引导，详细 Provider/Channel 配置请使用官方 Dashboard。
      </p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-sm">
        <div class="border-b border-[var(--ui-border)] pb-2">
          <div class="text-[var(--ui-text-muted)] mb-0.5">官方文档</div>
          <a href="https://hermes-agent.nousresearch.com/docs/" target="_blank" rel="noopener" class="text-primary hover:underline break-all">hermes-agent.nousresearch.com/docs</a>
        </div>
        <div class="border-b border-[var(--ui-border)] pb-2">
          <div class="text-[var(--ui-text-muted)] mb-0.5">中文社区</div>
          <a href="https://hermesagent.org.cn/docs/getting-started/installation" target="_blank" rel="noopener" class="text-primary hover:underline break-all">hermesagent.org.cn/docs</a>
        </div>
        <div class="border-b border-[var(--ui-border)] pb-2">
          <div class="text-[var(--ui-text-muted)] mb-0.5">Hermes 主页</div>
          <a href="https://github.com/NousResearch/hermes" target="_blank" rel="noopener" class="text-primary hover:underline break-all">github.com/NousResearch/hermes</a>
        </div>
        <div class="border-b border-[var(--ui-border)] pb-2">
          <div class="text-[var(--ui-text-muted)] mb-0.5">本应用源码</div>
          <a href="https://github.com/yaozy2020/com.nousresearch.hermes" target="_blank" rel="noopener" class="text-primary hover:underline break-all">github.com/yaozy2020/com.nousresearch.hermes</a>
        </div>
      </div>
    </UCard>
  </div>
</template>
