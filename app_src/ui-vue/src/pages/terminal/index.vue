<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/composables/useApi'

interface TerminalStatus {
  ttyd_available: boolean
  running: boolean
  pid?: number
  port?: number
}

interface TerminalStartResponse {
  ok: boolean
  error?: string
  pid?: number
  port?: number
  args?: string[]
}

const toast = useToast()
function notify(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') {
  const color = type === 'error' ? 'error' : type === 'warning' ? 'warning' : type === 'success' ? 'success' : 'neutral'
  const icon = type === 'error' ? 'i-lucide-x-circle' : type === 'warning' ? 'i-lucide-alert-triangle' : type === 'success' ? 'i-lucide-check-circle' : 'i-lucide-info'
  toast.add({ title: message, color, icon })
}

const status = ref<TerminalStatus | null>(null)
const lastStart = ref<TerminalStartResponse | null>(null)
const loading = ref(false)

const commands = [
  { id: 'setup', label: 'hermes setup', desc: '完整向导', icon: 'i-lucide-wand-sparkles' },
  { id: 'model', label: 'hermes model', desc: '选模型', icon: 'i-lucide-brain' },
  { id: 'login', label: 'hermes login', desc: 'OAuth 登录', icon: 'i-lucide-key-round' },
  { id: 'gateway', label: 'hermes gateway setup', desc: 'Gateway 配置', icon: 'i-lucide-zap' },
  { id: 'doctor', label: 'hermes doctor', desc: '健康检查', icon: 'i-lucide-stethoscope' },
  { id: 'status', label: 'hermes status', desc: '查看状态', icon: 'i-lucide-activity' },
] as const

function isMobile() {
  if (typeof window === 'undefined') return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768
}

async function refreshStatus() {
  try {
    const s = await api<TerminalStatus>('api/terminal/status')
    status.value = s
  } catch (e: unknown) {
    const err = e as Error
    notify('获取终端状态失败: ' + (err?.message ?? String(e)), 'error')
  }
}

async function startTerminal(cmd: string) {
  loading.value = true
  try {
    const mobile = isMobile()
    const r = await api<TerminalStartResponse>('api/terminal/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd, mobile }),
    })
    if (!r.ok) {
      notify('启动失败: ' + (r.error || '未知错误'), 'error')
      return
    }
    lastStart.value = r
    notify('终端已启动', 'success')
    if (mobile) {
      window.location.href = `./ttyd-mobile?cmd=${encodeURIComponent(cmd)}`
    } else {
      openInTab(cmd)
    }
  } catch (e: unknown) {
    const err = e as Error
    notify('启动失败: ' + (err?.message ?? String(e)), 'error')
  } finally {
    loading.value = false
    refreshStatus()
  }
}

async function stopTerminal() {
  try {
    await api('api/terminal/stop', { method: 'POST' })
    notify('终端已关闭', 'success')
  } catch (e: unknown) {
    const err = e as Error
    notify('关闭失败: ' + (err?.message ?? String(e)), 'error')
  } finally {
    lastStart.value = null
    refreshStatus()
  }
}

async function openInTab(cmd: string) {
  loading.value = true
  try {
    const r = await api<TerminalStartResponse>('api/terminal/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd, mobile: false }),
    })
    if (!r.ok) {
      notify('启动失败: ' + (r.error || '未知错误'), 'error')
      return
    }
    lastStart.value = r
    notify('终端已启动', 'success')
    window.open('./ttyd/', '_blank', 'noopener')
  } catch (e: unknown) {
    const err = e as Error
    notify('启动失败: ' + (err?.message ?? String(e)), 'error')
  } finally {
    loading.value = false
    refreshStatus()
  }
}

onMounted(refreshStatus)
</script>

<template>
  <div class="mx-auto space-y-6">
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 class="text-3xl font-bold text-[var(--ui-text)]">CLI 终端</h1>
        <p class="text-[var(--ui-text-muted)] mt-2">在浏览器里直接跑 hermes 命令（OAuth、密钥粘贴、设备授权码全部支持）</p>
      </div>
      <div class="flex gap-2">
        <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" @click="refreshStatus">状态</UButton>
        <UButton color="error" variant="outline" icon="i-lucide-x" :disabled="!status?.running" @click="stopTerminal">关闭终端</UButton>
      </div>
    </div>

    <UAlert color="info" variant="soft" icon="i-lucide-info" title="使用说明"
      description="点按钮启动命令。桌面端会在新标签页打开终端；移动端会进入全屏移动适配界面。所有终端流量均通过主应用代理，无需直接访问额外端口。" />

    <UAlert color="warning" variant="subtle" icon="i-lucide-shield"
      title="为什么不能跑别的命令？"
      description="出于安全考虑，本终端仅允许执行 hermes setup / model / login / gateway setup / doctor / status 这 6 条受白名单保护的命令。需要完整 shell 请使用 fnOS 自带终端或 SSH 登录。" />

    <UCard class="bg-[var(--ui-bg-card)] shadow-sm" :ui="{ root: 'ring-0 divide-y-0', body: 'p-5' }">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-terminal" class="w-5 h-5 text-primary" />
          <span class="font-semibold text-[var(--ui-text)]">选择要执行的命令</span>
        </div>
      </template>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <UButton
          v-for="c in commands"
          :key="c.id"
          color="primary"
          variant="outline"
          :icon="c.icon"
          :loading="loading"
          @click="startTerminal(c.id)"
        >
          <div class="text-left">
            <div class="font-medium">{{ c.label }}</div>
            <div class="text-xs opacity-70">{{ c.desc }}</div>
          </div>
        </UButton>
      </div>

      <div class="mt-4 p-3 bg-[var(--ui-bg-elevated)]/50 border border-[var(--ui-border)] rounded-lg text-sm text-[var(--ui-text-muted)]">
        <span v-if="!status">检查中…</span>
        <span v-else-if="!status.ttyd_available" class="text-error">⚠️ ttyd 二进制未找到，请检查 fpk 是否完整安装。</span>
        <span v-else-if="status.running">✅ 终端运行中（PID {{ status.pid }}）</span>
        <span v-else>空闲。点上方按钮启动一个命令。</span>
      </div>

      <div v-if="lastStart?.ok" class="mt-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium text-[var(--ui-text)]">终端已启动</div>
            <div class="text-sm text-[var(--ui-text-muted)] font-mono">{{ (lastStart.args || ['hermes']).join(' ') }} · PID {{ lastStart.pid }}</div>
          </div>
          <UButton color="primary" icon="i-lucide-external-link" @click="openInTab">打开终端</UButton>
        </div>
      </div>
    </UCard>
  </div>
</template>
