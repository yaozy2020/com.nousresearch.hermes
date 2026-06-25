<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getApiBase, getApiToken } from '@/composables/useApi'
import { useToast } from '@nuxt/ui/composables'

const toast = useToast()
const backups = ref<Array<{ id: string; size: number; mtime: number; type: 'upgrade' | 'regular' }>>([])
const loading = ref(false)
const restoring = ref<string | null>(null)
const deleting = ref<string | null>(null)

const restoreModalOpen = ref(false)
const restoreModalTarget = ref<string | null>(null)
const deleteModalOpen = ref(false)
const deleteModalTarget = ref<string | null>(null)

function apiUrl(path: string): string {
  const base = getApiBase()
  const clean = String(path ?? '').replace(/^\/+/, '')
  return `${base}${clean}`
}

async function apiJson<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = getApiToken()
  const headers = new Headers(init?.headers)
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const res = await fetch(apiUrl(path), { ...init, headers })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return (await res.json()) as T
}

async function loadBackups() {
  loading.value = true
  try {
    const [regularRes, upgradeRes] = await Promise.all([
      apiJson<{ ok: boolean; backups: any[] }>('/api/backup/list').catch(() => ({ ok: true, backups: [] })),
      apiJson<{ ok: boolean; backups: any[] }>('/api/upgrade-backups').catch(() => ({ ok: true, backups: [] }))
    ])
    const regular = (regularRes.backups || []).map((b: any) => ({ ...b, type: 'regular' as const }))
    const upgrade = (upgradeRes.backups || []).map((b: any) => ({ ...b, type: 'upgrade' as const }))
    backups.value = [...regular, ...upgrade].sort((a, b) => b.mtime - a.mtime)
  } catch (e: any) {
    toast.add({ title: '加载失败', description: e?.message || String(e), color: 'error' })
  } finally {
    loading.value = false
  }
}

async function createBackup() {
  try {
    const r = await apiJson<{ ok: boolean; id?: string; error?: string }>('/api/backup/create', { method: 'POST' })
    if (r.ok) {
      toast.add({ title: '备份成功', description: r.id || '', color: 'success' })
      await loadBackups()
    } else {
      toast.add({ title: '备份失败', description: r.error || '未知错误', color: 'error' })
    }
  } catch (e: any) {
    toast.add({ title: '备份失败', description: e?.message || String(e), color: 'error' })
  }
}

function openRestoreModal(id: string) {
  restoreModalTarget.value = id
  restoreModalOpen.value = true
}

async function doRestore() {
  const id = restoreModalTarget.value
  if (!id) return
  restoreModalOpen.value = false
  restoring.value = id
  try {
    const r = await apiJson<{ ok: boolean; restoredFrom?: string; error?: string }>('/api/backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    })
    if (r.ok) {
      toast.add({ title: '恢复成功', description: r.restoredFrom || '', color: 'success' })
    } else {
      toast.add({ title: '恢复失败', description: r.error || '未知错误', color: 'error' })
    }
  } catch (e: any) {
    toast.add({ title: '恢复失败', description: e?.message || String(e), color: 'error' })
  } finally {
    restoring.value = null
  }
}

function openDeleteModal(id: string) {
  deleteModalTarget.value = id
  deleteModalOpen.value = true
}

async function doDelete() {
  const id = deleteModalTarget.value
  if (!id) return
  deleteModalOpen.value = false
  deleting.value = id
  try {
    const endpoints = backups.value.find(b => b.id === id)?.type === 'upgrade'
      ? `/api/upgrade-backups/${encodeURIComponent(id)}`
      : `/api/backup/${encodeURIComponent(id)}`
    const r = await apiJson<{ ok: boolean; error?: string }>(endpoints, { method: 'DELETE' })
    if (r.ok) {
      toast.add({ title: '删除成功', color: 'success' })
      await loadBackups()
    } else {
      toast.add({ title: '删除失败', description: r.error || '未知错误', color: 'error' })
    }
  } catch (e: any) {
    toast.add({ title: '删除失败', description: e?.message || String(e), color: 'error' })
  } finally {
    deleting.value = null
  }
}

function formatSize(bytes: number) {
  if (!bytes) return '-'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++ }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatTime(ts: number) {
  if (!ts) return '-'
  const d = new Date(ts)
  return d.toLocaleString('zh-CN', { hour12: false })
}

onMounted(() => {
  loadBackups()
})
</script>

<template>
  <div class="p-4 space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-semibold">备份管理</h1>
      <UButton size="xs" icon="i-lucide-plus" label="新建备份" :disabled="loading" @click="createBackup" />
    </div>

    <UCard v-if="!loading && backups.length === 0" class="bg-[var(--ui-bg-card)] shadow-sm">
      <div class="p-6 text-center text-[var(--ui-text-muted)]">暂无备份</div>
    </UCard>

    <div v-else class="space-y-2">
      <UCard v-for="b in backups" :key="b.id" class="bg-[var(--ui-bg-card)] shadow-sm divide-y divide-[var(--ui-border)]">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="text-sm font-medium truncate">{{ b.id }}</div>
            <div class="text-xs text-[var(--ui-text-muted)] mt-1">
              <span class="mr-3">{{ b.type === 'upgrade' ? '升级备份' : '普通备份' }}</span>
              <span class="mr-3">{{ formatSize(b.size) }}</span>
              <span>{{ formatTime(b.mtime) }}</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              size="xs"
              color="primary"
              variant="outline"
              :disabled="restoring === b.id"
              @click="openRestoreModal(b.id)"
            >{{ restoring === b.id ? '恢复中...' : '恢复' }}</UButton>
            <UButton
              size="xs"
              color="error"
              variant="ghost"
              :disabled="deleting === b.id"
              @click="openDeleteModal(b.id)"
            >{{ deleting === b.id ? '删除中...' : '删除' }}</UButton>
          </div>
        </div>
      </UCard>
    </div>
  </div>

  <!-- 恢复确认弹窗 -->
  <div v-if="restoreModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div class="bg-[var(--ui-bg-card)] border border-[var(--ui-border)] rounded-xl shadow-xl max-w-sm w-full mx-4 p-5">
      <h3 class="text-base font-semibold text-[var(--ui-text)] mb-2">确认恢复备份</h3>
      <p class="text-sm text-[var(--ui-text-muted)] mb-4">
        确定恢复备份 <span class="font-mono">{{ restoreModalTarget }}</span>？<br/>
        当前数据会被先自动保护，但恢复后 Gateway 可能需要重启。
      </p>
      <div class="flex justify-end gap-2">
        <UButton size="sm" variant="ghost" @click="restoreModalOpen = false">取消</UButton>
        <UButton size="sm" color="primary" :loading="restoring === restoreModalTarget" @click="doRestore()">确定</UButton>
      </div>
    </div>
  </div>

  <!-- 删除确认弹窗 -->
  <div v-if="deleteModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div class="bg-[var(--ui-bg-card)] border border-[var(--ui-border)] rounded-xl shadow-xl max-w-sm w-full mx-4 p-5">
      <h3 class="text-base font-semibold text-[var(--ui-text)] mb-2">确认删除备份</h3>
      <p class="text-sm text-[var(--ui-text-muted)] mb-4">
        确定删除备份 <span class="font-mono">{{ deleteModalTarget }}</span>？此操作不可撤销。
      </p>
      <div class="flex justify-end gap-2">
        <UButton size="sm" variant="ghost" @click="deleteModalOpen = false">取消</UButton>
        <UButton size="sm" color="error" :loading="deleting === deleteModalTarget" @click="doDelete()">删除</UButton>
      </div>
    </div>
  </div>
</template>
