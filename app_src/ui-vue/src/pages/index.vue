<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from '@/composables/useApi'
import StatusCard from '@/components/StatusCard.vue'
import type { HealthResponse, LogResponse } from '@/types/api'

interface HermesStatus {
  installed: boolean
  installing?: boolean
  bin?: string
}

interface GatewayStatus {
  running: boolean
  pid?: number
  uptime?: string
  version?: { panel?: string; hermes?: string }
}

interface DashboardStatus {
  running: boolean
  pid?: number
  uptime?: string
  port?: number
  insecure?: boolean
}

interface TerminalSummary {
  running: boolean
  pid?: number
  uptime?: string
  port?: number
}

const toast = useToast()

function showNotification(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') {
  const color = type === 'error' ? 'error' : type === 'warning' ? 'warning' : type === 'success' ? 'success' : 'neutral'
  const icon = type === 'error' ? 'i-lucide-x-circle' : type === 'warning' ? 'i-lucide-alert-triangle' : type === 'success' ? 'i-lucide-check-circle' : 'i-lucide-info'
  toast.add({ title: message, color, icon })
}

const hermes = ref<HermesStatus | null>(null)
const gateway = ref<GatewayStatus | null>(null)
const dashboard = ref<DashboardStatus | null>(null)
const terminal = ref<TerminalSummary | null>(null)
const recentLogs = ref<string>('')
const loading = ref(false)
const timer = ref<number | null>(null)

const panelVersion = computed(() => gateway.value?.version?.panel || '-')
const hermesVersion = computed(() => gateway.value?.version?.hermes || '-')

async function refreshOverview(notify = false) {
  loading.value = true
  try {
    const [health, l] = await Promise.all([
      api<HealthResponse>('api/health').catch(() => null),
      api<LogResponse>('api/logs?lines=10').catch(() => ({ lines: [] })),
    ])
    if (!health) {
      hermes.value = { installed: false }
      gateway.value = { running: false }
      dashboard.value = { running: false }
      terminal.value = { running: false }
      if (notify) showNotification('无法获取运行状态', 'error')
      return
    }
    hermes.value = { installed: health.hermesInstalled, installing: health.hermesInstalling, bin: health.bin }
    gateway.value = { running: health.gatewayRunning, pid: health.gatewayPid ?? undefined, uptime: health.gatewayUptime ?? undefined, version: health.version }
    dashboard.value = { running: health.dashboardRunning, pid: health.dashboardPid ?? undefined, uptime: health.dashboardUptime ?? undefined, port: health.dashboardPort, insecure: health.dashboardInsecure }
    terminal.value = { running: health.ttydRunning, pid: health.ttydPid ?? undefined, uptime: health.ttydUptime ?? undefined, port: health.ttydPort ?? undefined }
    const lines = l.lines || []
    recentLogs.value = lines.length ? lines.join('\n') : '暂无日志'
    if (notify) showNotification('状态已刷新', 'success')
  } catch (e: unknown) {
    const err = e as Error
    if (notify) showNotification('刷新失败: ' + (err?.message ?? String(e)), 'error')
  } finally {
    loading.value = false
  }
}

async function gatewayAction(act: 'start' | 'stop' | 'restart') {
  const label = act === 'start' ? '启动' : act === 'stop' ? '停止' : '重启'
  showNotification(`Gateway 正在${label}…`, 'info')
  try {
    const r = await api<{ ok: boolean; error?: string }>(`api/gateway/${act}`, { method: 'POST' })
    if (r.ok) showNotification(`Gateway ${label} 成功`, 'success')
    else showNotification(r.error || `${label} 失败`, 'error')
  } catch (e: unknown) {
    const err = e as Error
    showNotification(`${label} 失败: ${err?.message ?? String(e)}`, 'error')
  } finally {
    refreshOverview()
  }
}

async function dashboardAction(act: 'start' | 'stop') {
  const label = act === 'start' ? '启动' : '停止'
  showNotification(`Dashboard 正在${label}…`, 'info')
  try {
    const r = await api<{ ok: boolean; error?: string }>(`api/dashboard/${act}`, { method: 'POST' })
    if (r.ok) showNotification(`Dashboard ${label} 成功`, 'success')
    else showNotification(r.error || `Dashboard ${label} 失败`, 'error')
  } catch (e: unknown) {
    const err = e as Error
    showNotification(`操作失败: ${err?.message ?? String(e)}`, 'error')
  } finally {
    refreshOverview()
  }
}

async function installHermes() {
  showNotification('开始安装 Hermes，可能需要 1-3 分钟…', 'info')
  if (hermes.value) hermes.value.installing = true
  try {
    const r = await api<{ ok: boolean; error?: string }>('api/hermes/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: 'hermes-agent' }),
    })
    if (r.ok) showNotification('Hermes 安装完成', 'success')
    else showNotification(r.error || '安装失败', 'error')
  } catch (e: unknown) {
    const err = e as Error
    showNotification('安装失败: ' + (err?.message ?? String(e)), 'error')
  } finally {
    refreshOverview()
  }
}

async function hermesRestartAll() {
  const ok = confirm('将停止 Gateway 与 Dashboard 后整体重启，需要约 3-8 秒。继续？')
  if (!ok) return
  showNotification('正在重启 Hermes…', 'info')
  try {
    const r = await api<{ ok: boolean; error?: string }>('api/hermes/restart', { method: 'POST' })
    if (r.ok) showNotification('Hermes 重启完成', 'success')
    else showNotification('重启失败: ' + (r.error || '未知错误'), 'error')
  } catch (e: unknown) {
    const err = e as Error
    showNotification('重启失败: ' + (err?.message ?? String(e)), 'error')
  } finally {
    setTimeout(() => refreshOverview(), 1200)
  }
}

// U5: 健康自检
interface DiagCheck { id: string; label: string; status: 'ok' | 'warn' | 'error'; detail: string }
interface DiagSummary { ok: number; warn: number; error: number }
const diagLoading = ref(false)
const diagOpen = ref(false)
const diagSummary = ref<DiagSummary | null>(null)
const diagChecks = ref<DiagCheck[]>([])
const diagTime = ref<string>('')

async function runDiagnostics() {
  diagLoading.value = true
  diagOpen.value = true
  try {
    const r = await api<{ ok: boolean; summary: DiagSummary; checks: DiagCheck[]; time: string }>('api/diagnostics')
    if (r.ok) {
      diagSummary.value = r.summary
      diagChecks.value = r.checks || []
      diagTime.value = r.time || new Date().toISOString()
      const totalIssues = (r.summary.warn || 0) + (r.summary.error || 0)
      if (totalIssues === 0) showNotification('健康自检：全部通过 ✓', 'success')
      else showNotification(`健康自检：${r.summary.ok} 通过 / ${r.summary.warn} 警告 / ${r.summary.error} 错误`, totalIssues > r.summary.warn ? 'error' : 'warning')
    } else {
      showNotification('健康自检失败', 'error')
    }
  } catch (e: unknown) {
    const err = e as Error
    showNotification('健康自检失败: ' + (err?.message ?? String(e)), 'error')
  } finally {
    diagLoading.value = false
  }
}

async function openDashboard() {
  try {
    const s = await api<DashboardStatus>('api/dashboard/status')
    if (!s.running) {
      showNotification('Dashboard 未运行，请先启动', 'warning')
      return
    }
    // 默认安全模式：Dashboard 绑定 127.0.0.1，不直接暴露到网络
    // 只有显式开启 HERMES_DASHBOARD_INSECURE=1 时才允许外部直接访问
    if (!dashboard.value?.insecure) {
      showNotification('当前为安全模式，Dashboard 仅监听本地地址。如需浏览器直接访问，请在配置中开启不安全模式。', 'info')
      return
    }
    // v0.30.5: 局域网无认证暴露时给出明确风险提示
    showNotification('⚠ Dashboard 当前为外部访问模式，无登录鉴权，请仅在可信局域网使用', 'warning')
    const host = window.location.hostname || 'localhost'
    const port = s.port || 9119
    window.open(`http://${host}:${port}`, '_blank', 'noopener')
  } catch {
    showNotification('无法获取 Dashboard 状态', 'error')
  }
}

async function lockDashboard() {
  if (!confirm('锁定后 Dashboard 将仅监听 127.0.0.1，需重启应用生效。继续？')) return
  try {
    const r = await api<{ ok: boolean; error?: string }>('api/dashboard/lock', { method: 'POST' })
    if (r.ok) showNotification('已锁为本地模式，请重启应用后生效', 'success')
    else showNotification(r.error || '锁定失败', 'error')
  } catch (e: unknown) {
    const err = e as Error
    showNotification('锁定失败: ' + (err?.message ?? String(e)), 'error')
  }
}

async function terminalAction(act: 'stop') {
  const label = act === 'stop' ? '停止' : '启动'
  showNotification(`终端正在${label}…`, 'info')
  try {
    const r = await api<{ ok: boolean; error?: string }>(`api/terminal/${act}`, { method: 'POST' })
    if (r.ok) showNotification(`终端${label}成功`, 'success')
    else showNotification(r.error || `${label}失败`, 'error')
  } catch (e: unknown) {
    const err = e as Error
    showNotification(`${label}失败: ${err?.message ?? String(e)}`, 'error')
  } finally {
    refreshOverview()
  }
}

onMounted(() => {
  refreshOverview()
  timer.value = window.setInterval(() => refreshOverview(), 5000)
})

onUnmounted(() => {
  if (timer.value) window.clearInterval(timer.value)
})
</script>

<template>
  <div class="mx-auto space-y-6">
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 class="text-3xl font-bold text-[var(--ui-text)]">
          状态总览
        </h1>
        <p class="text-[var(--ui-text-muted)] mt-2">
          实时查看 Hermes 安装、Gateway 与 Dashboard 进程状态
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          color="primary"
          variant="outline"
          icon="i-lucide-stethoscope"
          :loading="diagLoading"
          @click="runDiagnostics"
        >
          健康自检
        </UButton>
        <UButton
          color="error"
          variant="solid"
          icon="i-lucide-rotate-ccw"
          :loading="loading"
          @click="hermesRestartAll"
        >
          重启 Hermes
        </UButton>
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-refresh-cw"
          :loading="loading"
          @click="refreshOverview(true)"
        >
          刷新
        </UButton>
      </div>
    </div>

    <!-- U5: 健康自检结果折叠面板 -->
    <UCard v-if="diagOpen" class="bg-[var(--ui-bg-card)] shadow-sm" :ui="{ root: 'ring-0 divide-y-0', body: 'p-5' }">
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-stethoscope" class="w-5 h-5 text-primary" />
            <span class="font-semibold text-[var(--ui-text)]">健康自检</span>
            <UBadge v-if="diagSummary" color="success" variant="soft" size="xs">{{ diagSummary.ok }} OK</UBadge>
            <UBadge v-if="diagSummary && diagSummary.warn > 0" color="warning" variant="soft" size="xs">{{ diagSummary.warn }} 警告</UBadge>
            <UBadge v-if="diagSummary && diagSummary.error > 0" color="error" variant="soft" size="xs">{{ diagSummary.error }} 错误</UBadge>
          </div>
          <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-x" @click="diagOpen = false" />
        </div>
      </template>
      <div class="space-y-2">
        <div v-if="diagLoading && diagChecks.length === 0" class="text-sm text-[var(--ui-text-muted)]">检查中…</div>
        <div
          v-for="c in diagChecks"
          :key="c.id"
          class="flex items-start gap-3 p-3 rounded-lg border border-[var(--ui-border)]"
          :class="c.status === 'error' ? 'bg-error/5 border-error/30' : c.status === 'warn' ? 'bg-warning/5 border-warning/30' : 'bg-[var(--ui-bg-elevated)]/50'"
        >
          <UIcon
            :name="c.status === 'ok' ? 'i-lucide-check-circle-2' : c.status === 'warn' ? 'i-lucide-alert-triangle' : 'i-lucide-x-circle'"
            :class="c.status === 'ok' ? 'text-success' : c.status === 'warn' ? 'text-warning' : 'text-error'"
            class="w-5 h-5 mt-0.5 shrink-0"
          />
          <div class="flex-1 min-w-0">
            <div class="font-medium text-[var(--ui-text)]">{{ c.label }}</div>
            <div class="text-xs text-[var(--ui-text-muted)] mt-1 break-all">{{ c.detail }}</div>
          </div>
        </div>
        <div v-if="diagTime" class="text-xs text-[var(--ui-text-muted)] mt-2 text-right">检查时间：{{ new Date(diagTime).toLocaleString() }}</div>
      </div>
    </UCard>

    <!-- 状态卡片 -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch auto-rows-fr">
      <StatusCard
        icon="i-lucide-layers"
        :title="hermes ? (hermes.installed ? '已安装' : hermes.installing ? '安装中…' : '未安装') : '检查中…'"
        :badge="hermes ? (hermes.installed ? 'Installed' : hermes.installing ? 'Installing' : 'Not Installed') : 'Checking'"
        :color="hermes ? (hermes.installed ? 'success' : hermes.installing ? 'warning' : 'neutral') : 'neutral'"
        :subtitle="!hermes?.installed ? 'Hermes AI 助手运行环境' : undefined"
      >
        <template v-if="hermes?.installed" #details>
          <div class="grid grid-cols-[auto_1fr] gap-x-3">
            <span class="text-[var(--ui-text-muted)]">Hermes</span>
            <span class="font-mono text-[var(--ui-text)]">v{{ hermesVersion }}</span>
            <span class="text-[var(--ui-text-muted)]">Dashboard</span>
            <span class="font-mono text-[var(--ui-text)]">v{{ hermesVersion }}</span>
          </div>
        </template>
        <template #actions>
          <UButton v-if="!hermes?.installed && !hermes?.installing" color="primary" size="sm" @click="installHermes">一键安装</UButton>
        </template>
      </StatusCard>

      <StatusCard
        icon="i-lucide-zap"
        :title="gateway ? (gateway.running ? '运行中' : '未运行') : '检查中…'"
        :badge="gateway ? (gateway.running ? 'Active' : 'Inactive') : 'Checking'"
        :color="gateway ? (gateway.running ? 'success' : 'neutral') : 'neutral'"
        :subtitle="gateway?.running ? `PID ${gateway.pid || '-'} · 已运行 ${gateway.uptime || '-'}` : 'Gateway 主进程'"
      >
        <template #actions>
          <UButton color="primary" size="sm" :disabled="gateway?.running" @click="gatewayAction('start')">启动</UButton>
          <UButton color="neutral" variant="outline" size="sm" :disabled="!gateway?.running" @click="gatewayAction('stop')">停止</UButton>
          <UButton color="neutral" variant="outline" size="sm" :disabled="!gateway?.running" @click="gatewayAction('restart')">重启</UButton>
        </template>
      </StatusCard>

      <StatusCard
        icon="i-lucide-layout-template"
        :title="dashboard ? (dashboard.running ? '运行中' : '未运行') : '检查中…'"
        :badge="dashboard ? (dashboard.running ? (dashboard.insecure ? '⚠ 未加密' : 'Active') : 'Inactive') : 'Checking'"
        :color="dashboard ? (dashboard.running ? (dashboard.insecure ? 'error' : 'success') : 'neutral') : 'neutral'"
        :subtitle="dashboard?.running ? `${dashboard.insecure ? '⚠ 局域网无认证暴露' : '本地安全模式'} · 端口 ${dashboard.port || '-'}` : 'Dashboard Web UI'"
      >
        <template #actions>
          <UButton color="primary" size="sm" :disabled="dashboard?.running" @click="dashboardAction('start')">启动</UButton>
          <UButton color="neutral" variant="outline" size="sm" :disabled="!dashboard?.running" @click="dashboardAction('stop')">停止</UButton>
          <UButton v-if="dashboard?.running && dashboard?.insecure" color="warning" variant="outline" size="sm" @click="lockDashboard">锁为本地</UButton>
          <UButton v-else-if="dashboard?.running" color="neutral" variant="outline" size="sm" disabled title="Dashboard 已锁为仅本地访问；如需局域网打开，请在 .env 中删除 HERMES_DASHBOARD_INSECURE=0 或设为 1 并重启">本地模式</UButton>
          <UButton color="neutral" variant="outline" size="sm" :disabled="!dashboard?.running || !dashboard?.insecure" @click="openDashboard">打开</UButton>
        </template>
      </StatusCard>

      <StatusCard
        icon="i-lucide-terminal"
        :title="terminal ? (terminal.running ? '运行中' : '未运行') : '检查中…'"
        :badge="terminal ? (terminal.running ? 'Active' : 'Inactive') : 'Checking'"
        :color="terminal ? (terminal.running ? 'success' : 'neutral') : 'neutral'"
        :subtitle="terminal?.running ? `PID ${terminal.pid || '-'} · 端口 ${terminal.port || '-'}` : 'CLI 终端'"
      >
        <template #actions>
          <UButton color="neutral" variant="outline" size="sm" :disabled="!terminal?.running" @click="$router.push('/terminal')">打开</UButton>
          <UButton color="neutral" variant="outline" size="sm" :disabled="!terminal?.running" @click="terminalAction('stop')">停止</UButton>
        </template>
      </StatusCard>
    </div>

    <!-- 版本与日志 -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <UCard class="bg-[var(--ui-bg-card)] shadow-sm lg:col-span-1" :ui="{ root: 'ring-0 divide-y-0', body: 'p-5' }">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-info" class="w-5 h-5 text-primary" />
            <span class="font-semibold text-[var(--ui-text)]">版本信息</span>
          </div>
        </template>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-[var(--ui-text-muted)]">Panel</span>
            <span class="font-mono text-[var(--ui-text)]">{{ panelVersion }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-[var(--ui-text-muted)]">Hermes</span>
            <span class="font-mono text-[var(--ui-text)]">{{ hermesVersion }}</span>
          </div>
        </div>
      </UCard>

      <UCard class="bg-[var(--ui-bg-card)] shadow-sm lg:col-span-2" :ui="{ root: 'ring-0 divide-y-0', body: 'p-5' }">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-file-text" class="w-5 h-5 text-primary" />
            <span class="font-semibold text-[var(--ui-text)]">最近日志</span>
          </div>
        </template>
        <pre class="bg-[var(--ui-bg-elevated)]/50 border border-[var(--ui-border)] rounded-lg p-3 text-xs font-mono text-[var(--ui-text-muted)] whitespace-pre-wrap break-all max-h-[220px] overflow-y-auto">{{ recentLogs }}</pre>
      </UCard>
    </div>
  </div>
</template>


