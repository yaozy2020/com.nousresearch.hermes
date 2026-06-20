<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api, getApiToken, setApiToken, clearApiToken } from '@/composables/useApi'

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

// ==== v0.31: API 鉴权管理 ====
interface AuthStatus { ok: boolean; enabled: boolean }
const authEnabled = ref(false)
const authBusy = ref(false)
const tokenInput = ref('')
const generatedToken = ref('')
const showToken = ref(false)

async function loadAuthStatus() {
  try {
    const r = await api<AuthStatus>('api/auth/status')
    authEnabled.value = !!r.enabled
    // 如果服务端已启用但 sessionStorage 没 token，提示用户输入
    if (authEnabled.value && !getApiToken()) {
      // 不自动弹窗，留给用户手动操作
    }
  } catch {
    authEnabled.value = false
  }
}

async function enableAuth() {
  if (!confirm('启用 API 鉴权后，所有请求都需要携带 Token。请确认你已记录 Token 的恢复方式（详见说明）。\n\n是否继续？')) return
  authBusy.value = true
  try {
    const r = await api<{ ok: boolean; token: string }>('api/auth/enable', { method: 'POST' })
    if (r.ok && r.token) {
      generatedToken.value = r.token
      showToken.value = true
      setApiToken(r.token)
      authEnabled.value = true
      notify('鉴权已启用，请立即复制保存 Token', 'success')
    }
  } catch (e: any) {
    notify(`启用失败：${e.message || e}`, 'error')
  } finally {
    authBusy.value = false
  }
}

async function disableAuth() {
  if (!confirm('确定关闭 API 鉴权？关闭后任何同源请求都可访问 API。')) return
  authBusy.value = true
  try {
    await api('api/auth/disable', { method: 'POST' })
    authEnabled.value = false
    generatedToken.value = ''
    showToken.value = false
    clearApiToken()
    notify('鉴权已关闭', 'success')
  } catch (e: any) {
    notify(`关闭失败：${e.message || e}`, 'error')
  } finally {
    authBusy.value = false
  }
}

async function resetToken() {
  if (!confirm('重置后旧 Token 立即失效，需要重新分发新 Token 给所有客户端。是否继续？')) return
  authBusy.value = true
  try {
    const r = await api<{ ok: boolean; token: string }>('api/auth/reset', { method: 'POST' })
    if (r.ok && r.token) {
      generatedToken.value = r.token
      showToken.value = true
      setApiToken(r.token)
      notify('Token 已重置，请立即保存新 Token', 'success')
    }
  } catch (e: any) {
    notify(`重置失败：${e.message || e}`, 'error')
  } finally {
    authBusy.value = false
  }
}

function applyTokenInput() {
  const t = tokenInput.value.trim()
  if (!t) {
    notify('Token 不能为空', 'warning')
    return
  }
  setApiToken(t)
  tokenInput.value = ''
  notify('Token 已保存到当前会话，刷新页面后生效', 'success')
}

function copyToken() {
  if (!generatedToken.value) return
  navigator.clipboard?.writeText(generatedToken.value).then(() => {
    notify('已复制到剪贴板', 'success')
  }).catch(() => {
    notify('复制失败，请手动选中', 'warning')
  })
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
  loadAuthStatus()
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
          <UIcon name="i-lucide-shield-check" class="w-5 h-5 text-primary" />
          <span class="font-semibold text-[var(--ui-text)]">API 鉴权</span>
          <UBadge :color="authEnabled ? 'success' : 'neutral'" variant="soft" size="sm" class="ml-1">
            {{ authEnabled ? '已启用' : '未启用' }}
          </UBadge>
        </div>
      </template>

      <div class="space-y-4">
        <div class="text-sm text-[var(--ui-text-muted)] leading-relaxed">
          启用后所有 <code>/api/*</code> 写操作需要 Bearer Token。默认关闭，向后兼容。
          <br>
          <span class="text-orange-500">⚠️ 启用前请理解三种忘记 Token 的恢复方式（见下方提示）。</span>
        </div>

        <div v-if="!authEnabled" class="flex gap-2">
          <UButton color="primary" :loading="authBusy" icon="i-lucide-shield" @click="enableAuth">
            启用 API 鉴权（生成新 Token）
          </UButton>
        </div>

        <div v-else class="flex flex-wrap gap-2">
          <UButton color="warning" variant="soft" :loading="authBusy" icon="i-lucide-rotate-cw" @click="resetToken">
            重置 Token
          </UButton>
          <UButton color="error" variant="soft" :loading="authBusy" icon="i-lucide-shield-off" @click="disableAuth">
            关闭鉴权
          </UButton>
        </div>

        <div v-if="showToken && generatedToken" class="rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg)] p-3 space-y-2">
          <div class="text-sm font-medium text-orange-500 flex items-center gap-1">
            <UIcon name="i-lucide-alert-triangle" class="w-4 h-4" />
            新 Token（仅显示一次，请立即复制保存）
          </div>
          <div class="flex gap-2 items-center">
            <code class="flex-1 font-mono text-xs break-all bg-black/5 dark:bg-white/5 px-2 py-1.5 rounded">{{ generatedToken }}</code>
            <UButton size="xs" icon="i-lucide-copy" variant="soft" @click="copyToken">复制</UButton>
            <UButton size="xs" icon="i-lucide-x" variant="ghost" @click="showToken = false">隐藏</UButton>
          </div>
          <div class="text-xs text-[var(--ui-text-muted)]">
            已自动保存到当前浏览器会话；其他设备需要手动配置。
          </div>
        </div>

        <div v-if="authEnabled" class="space-y-2">
          <div class="text-sm font-medium text-[var(--ui-text)]">手动配置 Token（其他设备访问时使用）</div>
          <div class="flex gap-2">
            <UInput v-model="tokenInput" placeholder="粘贴 Token..." class="flex-1" type="password" />
            <UButton icon="i-lucide-check" variant="soft" @click="applyTokenInput">应用</UButton>
          </div>
        </div>

        <details class="text-sm">
          <summary class="cursor-pointer text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]">忘记 Token 怎么办？（3 种恢复方式）</summary>
          <div class="mt-2 space-y-2 pl-4 text-[var(--ui-text-muted)] leading-relaxed">
            <p><strong class="text-[var(--ui-text)]">方式 1（推荐）</strong>：在 fnOS 应用商店打开 Hermes，进入"关于"页 →「API 鉴权」→ 点「重置 Token」。</p>
            <p><strong class="text-[var(--ui-text)]">方式 2（高级）</strong>：SSH 进入 NAS，运行 <code class="bg-black/10 dark:bg-white/10 px-1 rounded">/vol2/@apphome/com.nousresearch.hermes/cmd/main reset-token</code>，自动清空 Token + 重启。</p>
            <p><strong class="text-[var(--ui-text)]">方式 3（兜底）</strong>：在 <code class="bg-black/10 dark:bg-white/10 px-1 rounded">/vol2/@apphome/com.nousresearch.hermes/data/home/</code> 创建空文件 <code class="bg-black/10 dark:bg-white/10 px-1 rounded">.reset_token</code>，下次应用启动时自动清空 Token 并删除该标记文件。可用 fnOS 文件管理器创建。</p>
          </div>
        </details>
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
