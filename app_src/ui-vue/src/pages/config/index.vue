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
    const s = await api<{ port?: number }>('api/dashboard/status')
    const port = s.port || 9119
    const host = window.location.hostname || 'localhost'
    window.open(`http://${host}:${port}`, '_blank', 'noopener')
  } catch {
    const host = window.location.hostname || 'localhost'
    window.open(`http://${host}:9119`, '_blank', 'noopener')
  }
}

onMounted(loadConfig)
</script>

<template>
  <div class="mx-auto space-y-6">
    <div>
      <h1 class="text-3xl font-bold text-[var(--ui-text)]">高级配置</h1>
      <p class="text-[var(--ui-text-muted)] mt-2">YAML / ENV 手动调整</p>
    </div>

    <UAlert color="info" variant="soft" icon="i-lucide-info" title="提示"
      description="推荐使用官方 Dashboard 配置 Provider 和 Channel，本页适合手动调整边缘参数。">
      <template #actions>
        <UButton color="primary" size="sm" @click="openDashboard">打开 Dashboard</UButton>
      </template>
    </UAlert>

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
