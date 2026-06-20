<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/composables/useApi'

interface ConfigResponse {
  yaml?: string
  env?: string
}

const toast = useToast()
function notify(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') {
  const color = type === 'error' ? 'error' : type === 'warning' ? 'warning' : type === 'success' ? 'success' : 'neutral'
  const icon = type === 'error' ? 'i-lucide-x-circle' : type === 'warning' ? 'i-lucide-alert-triangle' : type === 'success' ? 'i-lucide-check-circle' : 'i-lucide-info'
  toast.add({ title: message, color, icon })
}

const yaml = ref('')
const env = ref('')
const loading = ref(false)
const saved = ref(false)

// v0.30.5: Dashboard 端口设置
const dashboardPort = ref<number>(9119)
const dashboardPortInput = ref<number | null>(null)
const portSaving = ref(false)

async function loadDashboardPort() {
  try {
    const r = await api<{ ok: boolean; port: number }>('api/settings/dashboard-port')
    if (r && r.ok) {
      dashboardPort.value = r.port
      dashboardPortInput.value = r.port
    }
  } catch {
    // 忽略，沿用默认 9119
  }
}

async function saveDashboardPort() {
  const p = Number(dashboardPortInput.value)
  if (!Number.isInteger(p) || p < 1024 || p > 65535) {
    notify('端口必须在 1024-65535 之间', 'error')
    return
  }
  if (p === dashboardPort.value) {
    notify('端口未变化', 'info')
    return
  }
  portSaving.value = true
  try {
    const r = await api<{ ok: boolean; error?: string; port?: number; needsAppRestart?: boolean }>('api/settings/dashboard-port', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port: p }),
    })
    if (r.ok) {
      dashboardPort.value = r.port || p
      notify(r.needsAppRestart
        ? `端口已写入 .env (${p})，请到 fnOS 应用中心重启 Hermes 让新端口生效`
        : `端口已更新为 ${p}`, 'success')
    } else {
      notify(r.error || '保存失败', 'error')
    }
  } catch (e: unknown) {
    const err = e as Error
    notify('保存失败: ' + (err?.message ?? String(e)), 'error')
  } finally {
    portSaving.value = false
  }
}

async function loadConfig() {
  loading.value = true
  try {
    const c = await api<ConfigResponse>('api/config')
    yaml.value = c.yaml || ''
    env.value = c.env || ''
    saved.value = false
  } catch (e: unknown) {
    const err = e as Error
    notify('加载配置失败: ' + (err?.message ?? String(e)), 'error')
  } finally {
    loading.value = false
  }
}

async function saveConfig() {
  loading.value = true
  try {
    const r = await api<{ ok: boolean; error?: string }>('api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yaml: yaml.value, env: env.value }),
    })
    if (r.ok) {
      saved.value = true
      notify('配置已保存，重启 Gateway 生效', 'success')
    } else {
      notify(r.error || '保存失败', 'error')
    }
  } catch (e: unknown) {
    const err = e as Error
    notify('保存失败: ' + (err?.message ?? String(e)), 'error')
  } finally {
    loading.value = false
  }
}

async function restartGateway() {
  try {
    const r = await api<{ ok: boolean; error?: string }>('api/gateway/restart', { method: 'POST' })
    if (r.ok) notify('Gateway 已重启', 'success')
    else notify(r.error || '重启失败', 'error')
  } catch (e: unknown) {
    const err = e as Error
    notify('重启失败: ' + (err?.message ?? String(e)), 'error')
  }
}

async function openDashboard() {
  try {
    const s = await api<{ running: boolean; port?: number; dashboardInsecure?: boolean }>('api/health')
    if (!s.dashboardRunning) {
      notify('Dashboard 未运行，请先启动', 'info')
      return
    }
    if (!s.dashboardInsecure) {
      notify('当前为安全模式，Dashboard 仅监听本地地址。如需浏览器直接访问，请在 .env 中添加 HERMES_DASHBOARD_INSECURE=1 并重启应用。', 'info')
      return
    }
    const port = s.dashboardPort || 9119
    const host = window.location.hostname || 'localhost'
    window.open(`http://${host}:${port}`, '_blank', 'noopener')
  } catch {
    notify('无法获取 Dashboard 状态', 'error')
  }
}

onMounted(async () => {
  await loadConfig()
  await loadDashboardPort()
})
</script>

<template>
  <div class="mx-auto space-y-6">
    <div>
      <h1 class="text-3xl font-bold text-[var(--ui-text)]">高级配置</h1>
      <p class="text-[var(--ui-text-muted)] mt-2">YAML / ENV 手动调整</p>
    </div>

    <UAlert color="info" variant="soft" icon="i-lucide-info" title="提示"
      description="推荐使用官方 Dashboard 配置 Provider 和 Channel，本页适合手动调整边缘参数。默认允许局域网直接访问 Dashboard；如需锁回仅本地访问，请在 .env 中设置 HERMES_DASHBOARD_INSECURE=0 并重启应用。">
      <template #actions>
        <UButton color="primary" size="sm" @click="openDashboard">打开 Dashboard</UButton>
      </template>
    </UAlert>

    <UCard class="bg-[var(--ui-bg-card)] shadow-sm" :ui="{ root: 'ring-0 divide-y-0', body: 'p-5' }">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-network" class="w-5 h-5 text-primary" />
          <span class="font-semibold text-[var(--ui-text)]">Dashboard 端口</span>
        </div>
      </template>
      <div class="space-y-3">
        <p class="text-sm text-[var(--ui-text-muted)]">
          当前端口：<code class="font-mono bg-[var(--ui-bg-elevated)] px-1 rounded">{{ dashboardPort }}</code>。
          修改后写入 <code class="font-mono">.env</code> 中的 <code class="font-mono">HERMES_DASHBOARD_PORT</code>，
          需要在 fnOS 应用中心 <strong>停止并启动</strong> Hermes 让新端口生效。
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <UFormField label="新端口（1024-65535）" class="flex-1 min-w-[180px]">
            <UInput v-model.number="dashboardPortInput" type="number" :min="1024" :max="65535" placeholder="9119" />
          </UFormField>
          <UButton color="primary" :loading="portSaving" :disabled="dashboardPortInput === dashboardPort" @click="saveDashboardPort">
            保存端口
          </UButton>
        </div>
      </div>
    </UCard>

    <UCard class="bg-[var(--ui-bg-card)] shadow-sm" :ui="{ root: 'ring-0 divide-y-0', body: 'p-5' }">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-file-code" class="w-5 h-5 text-primary" />
          <span class="font-semibold text-[var(--ui-text)]">配置文件</span>
        </div>
      </template>
      <div class="space-y-4">
        <UFormField label="config.yaml">
          <UTextarea v-model="yaml" :rows="16" class="w-full font-mono text-sm" placeholder="# Hermes 主配置..." />
        </UFormField>
        <UFormField label=".env">
          <UTextarea v-model="env" :rows="10" class="w-full font-mono text-sm" placeholder="# 环境变量 (KEY=VALUE)" />
          <p class="text-xs text-[var(--ui-text-muted)] mt-1">
            安全提示：API Key / Token 等敏感值已脱敏显示为 __MASKED__，未修改时不会覆盖原值。
          </p>
          <UAlert class="mt-3" color="warning" variant="soft" icon="i-lucide-shield-alert" title="Dashboard 访问模式">
            <template #description>
              <div class="space-y-1 text-xs">
                <p>默认情况下 Dashboard 监听 <code class="font-mono bg-[var(--ui-bg-elevated)] px-1 rounded">0.0.0.0:9119</code>，允许局域网直接访问 <code class="font-mono bg-[var(--ui-bg-elevated)] px-1 rounded">http://nas:9119</code>。</p>
                <p>如需恢复仅本地访问（更安全）：</p>
                <ol class="list-decimal list-inside space-y-0.5">
                  <li>在本页 .env 中添加或修改：<code class="font-mono bg-[var(--ui-bg-elevated)] px-1 rounded">HERMES_DASHBOARD_INSECURE=0</code></li>
                  <li>点「保存」</li>
                  <li>到 fnOS 应用中心停止并重新启动 Hermes 应用</li>
                  <li>回到面板，Dashboard 状态会变为「本地安全模式」</li>
                </ol>
                <p class="text-[var(--ui-text-muted)]">注意：局域网无认证暴露意味着同一网络内任何人都能访问 Dashboard；公网/多用户环境建议保持本地模式。</p>
              </div>
            </template>
          </UAlert>
        </UFormField>
      </div>
      <div class="flex flex-wrap gap-2 mt-5">
        <UButton color="primary" :loading="loading" @click="saveConfig">保存</UButton>
        <UButton color="neutral" variant="outline" :loading="loading" @click="loadConfig">重新加载</UButton>
        <UButton v-if="saved" color="neutral" variant="ghost" @click="restartGateway">重启 Gateway</UButton>
      </div>
    </UCard>
  </div>
</template>
