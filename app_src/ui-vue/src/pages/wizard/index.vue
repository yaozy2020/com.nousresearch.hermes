<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/composables/useApi'

interface HermesStatus { installed: boolean; bin?: string }
interface GatewayStatus { running: boolean; pid?: number }
interface DashboardStatus { running: boolean; pid?: number; port?: number }
interface ConfigResponse { yaml?: string; env?: string }

const toast = useToast()
function notify(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') {
  const color = type === 'error' ? 'error' : type === 'warning' ? 'warning' : type === 'success' ? 'success' : 'neutral'
  const icon = type === 'error' ? 'i-lucide-x-circle' : type === 'warning' ? 'i-lucide-alert-triangle' : type === 'success' ? 'i-lucide-check-circle' : 'i-lucide-info'
  toast.add({ title: message, color, icon })
}

const steps = [
  { n: 1, label: '安装 Hermes' },
  { n: 2, label: '选择 Provider' },
  { n: 3, label: '启动 Gateway' },
  { n: 4, label: '启动 Dashboard' },
]

const currentStep = ref(1)
const done = ref<Record<number, boolean>>({ 1: false, 2: false, 3: false, 4: false })
const hermes = ref<HermesStatus | null>(null)
const gateway = ref<GatewayStatus | null>(null)
const dashboard = ref<DashboardStatus | null>(null)
const config = ref<ConfigResponse>({})
const loading = ref(false)

const providers = [
  { id: 'openrouter', name: 'OpenRouter', base_url: 'https://openrouter.ai/api/v1', env_key: 'OPENROUTER_API_KEY', tag: '聚合 · 推荐', editable_url: false },
  { id: 'opencode-zen', name: 'OpenCode Zen', base_url: 'https://opencode.ai/zen/v1', env_key: 'OPENCODE_ZEN_API_KEY', tag: '聚合 · 含免费', editable_url: true },
  { id: 'opencode-go', name: 'OpenCode Go', base_url: 'https://opencode.ai/go/v1', env_key: 'OPENCODE_GO_API_KEY', tag: '订阅', editable_url: true },
  { id: 'deepseek', name: 'DeepSeek', base_url: 'https://api.deepseek.com/v1', env_key: 'DEEPSEEK_API_KEY', tag: '国内直连', editable_url: false },
  { id: 'glm', name: '智谱 GLM', base_url: 'https://open.bigmodel.cn/api/paas/v4', env_key: 'GLM_API_KEY', tag: '国内直连', editable_url: false },
  { id: 'kimi', name: 'Moonshot Kimi', base_url: 'https://api.moonshot.cn/v1', env_key: 'KIMI_API_KEY', tag: '国内直连', editable_url: false },
  { id: 'minimax', name: 'MiniMax', base_url: 'https://api.minimax.chat/v1', env_key: 'MINIMAX_API_KEY', tag: '国内直连', editable_url: false },
  { id: 'anthropic', name: 'Anthropic', base_url: 'https://api.anthropic.com', env_key: 'ANTHROPIC_API_KEY', tag: '国际', editable_url: false },
  { id: 'gemini', name: 'Google Gemini', base_url: 'https://generativelanguage.googleapis.com/v1beta', env_key: 'GOOGLE_API_KEY', tag: '国际', editable_url: false },
  { id: 'openai', name: 'OpenAI', base_url: 'https://api.openai.com/v1', env_key: 'OPENAI_API_KEY', tag: '国际', editable_url: false },
]

const selectedProvider = ref<string | null>(null)
const providerBaseUrl = ref('')
const providerApiKey = ref('')

function selectedProviderInfo() {
  return providers.find(p => p.id === selectedProvider.value) || null
}

async function initWizard() {
  loading.value = true
  try {
    const [h, c, g, d] = await Promise.all([
      api<HermesStatus>('api/hermes/status').catch(() => ({ installed: false })),
      api<ConfigResponse>('api/config').catch(() => ({ yaml: '' })),
      api<GatewayStatus>('api/status').catch(() => ({ running: false })),
      api<DashboardStatus>('api/dashboard/status').catch(() => ({ running: false })),
    ])
    hermes.value = h
    config.value = c
    gateway.value = g
    dashboard.value = d

    done.value[1] = !!h.installed
    done.value[2] = !!(c.yaml && /provider\s*:/i.test(c.yaml))
    done.value[3] = !!g.running
    done.value[4] = !!d.running

    let step = 1
    for (let i = 1; i <= 4; i++) {
      if (!done.value[i]) { step = i; break }
      if (i === 4) step = 4
    }
    currentStep.value = step
  } finally {
    loading.value = false
  }
}


function nextStep() {
  if (currentStep.value < 4) currentStep.value++
}

function prevStep() {
  if (currentStep.value > 1) currentStep.value--
}

async function installHermes() {
  loading.value = true
  try {
    const r = await api<{ ok: boolean; error?: string }>('api/hermes/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: 'hermes-agent' }),
    })
    if (r.ok) notify('安装完成', 'success')
    else notify(r.error || '安装失败', 'error')
  } catch (e: unknown) {
    const err = e as Error
    notify('安装失败: ' + (err?.message ?? String(e)), 'error')
  } finally {
    await initWizard()
  }
}

function selectProvider(id: string) {
  selectedProvider.value = id
  const p = providers.find(x => x.id === id)
  if (p) providerBaseUrl.value = p.base_url
  providerApiKey.value = ''
}

async function saveProvider() {
  const p = selectedProviderInfo()
  if (!p) return
  const baseUrl = providerBaseUrl.value.trim() || p.base_url
  const apiKey = providerApiKey.value.trim()
  const providerId = p.id === 'openai_compat' ? 'openai' : p.id
  const yaml = `model:\n  provider: ${providerId}\n  base_url: ${baseUrl}\n  default: ''\n`

  try {
    const cur = await api<ConfigResponse>('api/config')
    let newEnv = cur.env || ''
    if (apiKey && p.env_key) {
      const re = new RegExp(`^${p.env_key}\\s*=.*$`, 'm')
      const line = `${p.env_key}=${apiKey}`
      if (re.test(newEnv)) {
        newEnv = newEnv.replace(re, line)
      } else {
        if (newEnv && !newEnv.endsWith('\n')) newEnv += '\n'
        newEnv += line + '\n'
      }
    }
    const r = await api<{ ok: boolean; error?: string }>('api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yaml, env: newEnv }),
    })
    if (r.ok) {
      done.value[2] = true
      notify(apiKey ? 'Provider + API Key 已保存' : 'Provider 已保存（API Key 待 Dashboard 填）', 'success')
      nextStep()
    } else {
      notify(r.error || '保存失败', 'error')
    }
  } catch (e: unknown) {
    const err = e as Error
    notify('保存失败: ' + (err?.message ?? String(e)), 'error')
  }
}

async function startGateway() {
  loading.value = true
  try {
    const r = await api<{ ok: boolean; error?: string }>('api/gateway/start', { method: 'POST' })
    if (r.ok) notify('Gateway 已启动', 'success')
    else notify(r.error || '启动失败', 'error')
  } catch (e: unknown) {
    const err = e as Error
    notify('启动失败: ' + (err?.message ?? String(e)), 'error')
  } finally {
    setTimeout(async () => { await initWizard() }, 800)
  }
}

async function startDashboard() {
  loading.value = true
  try {
    const r = await api<{ ok: boolean; error?: string }>('api/dashboard/start', { method: 'POST' })
    if (r.ok) notify('Dashboard 已启动', 'success')
    else notify(r.error || '启动失败', 'error')
  } catch (e: unknown) {
    const err = e as Error
    notify('启动失败: ' + (err?.message ?? String(e)), 'error')
  } finally {
    setTimeout(async () => { await initWizard() }, 1200)
  }
}

async function openDashboard() {
  try {
    const s = await api<DashboardStatus>('api/dashboard/status')
    const port = s.port || 9119
    const host = window.location.hostname || 'localhost'
    window.open(`http://${host}:${port}`, '_blank', 'noopener')
  } catch {
    const host = window.location.hostname || 'localhost'
    window.open(`http://${host}:9119`, '_blank', 'noopener')
  }
}

function skipWizard() {
  localStorage.setItem('hermes-wizard-skipped', '1')
  notify('已跳过向导', 'info')
}

onMounted(initWizard)
</script>

<template>
  <div class="mx-auto space-y-6">
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 class="text-3xl font-bold text-[var(--ui-text)]">快速向导</h1>
        <p class="text-[var(--ui-text-muted)] mt-2">4 步完成首次配置</p>
      </div>
      <UButton color="neutral" variant="ghost" @click="skipWizard">跳过向导</UButton>
    </div>

    <UAlert color="warning" variant="soft" icon="i-lucide-alert-triangle" title="使用声明"
      description="本应用采用独立用户运行机制（非 ROOT 权限），仅作为 Hermes 服务的集成工具，不对 Hermes 软件本身的安全性、稳定性作任何保证。配置涉及 API Key、Token 等敏感信息，请妥善保管。" />

    <UAlert color="primary" variant="soft" icon="i-lucide-terminal" title="推荐：使用 CLI 终端完成初始化"
      description="本向导提供图形化最小配置；如需完整体验 hermes 命令行，建议直接使用内置 CLI 终端，它运行在容器内并预设了正确的 venv 与环境变量。">
      <template #actions>
        <UButton color="primary" size="sm" to="/terminal">打开 CLI 终端 →</UButton>
      </template>
    </UAlert>

    <!-- 步骤进度 -->
    <div class="flex items-center justify-between bg-[var(--ui-bg-card)] border border-[var(--ui-border)] rounded-xl p-4">
      <template v-for="(s, idx) in steps" :key="s.n">
        <div class="flex items-center gap-3">
          <div
            class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold"
            :class="done[s.n]
              ? 'bg-success/10 text-success'
              : currentStep === s.n
                ? 'bg-primary/10 text-primary'
                : 'bg-[var(--ui-bg-elevated)] text-[var(--ui-text-muted)]'"
          >
            <UIcon v-if="done[s.n]" name="i-lucide-check" class="w-4 h-4" />
            <span v-else>{{ s.n }}</span>
          </div>
          <span
            class="text-sm hidden sm:block"
            :class="currentStep === s.n ? 'text-[var(--ui-text)] font-medium' : 'text-[var(--ui-text-muted)]'"
          >{{ s.label }}</span>
        </div>
        <div v-if="idx < steps.length - 1" class="flex-1 h-px bg-[var(--ui-border)] mx-3" />
      </template>
    </div>

    <!-- 步骤 1 -->
    <UCard v-if="currentStep === 1" class="bg-[var(--ui-bg-card)] shadow-sm" :ui="{ root: 'ring-0 divide-y-0', body: 'p-5' }">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-layers" class="w-5 h-5 text-primary" />
          <span class="font-semibold text-[var(--ui-text)]">步骤 1：安装 Hermes</span>
        </div>
      </template>
      <div v-if="hermes?.installed" class="space-y-3">
        <div class="flex items-center gap-3">
          <UBadge color="success" variant="soft"><UIcon name="i-lucide-check-circle" class="w-4 h-4 mr-1" />已安装</UBadge>
          <UButton color="primary" size="sm" @click="nextStep">下一步</UButton>
        </div>
        <div class="text-sm text-[var(--ui-text-muted)]">路径：<span class="font-mono text-[var(--ui-text)]">{{ hermes.bin }}</span></div>
      </div>
      <div v-else class="space-y-3">
        <UBadge color="neutral" variant="soft"><UIcon name="i-lucide-stop-circle" class="w-4 h-4 mr-1" />未安装</UBadge>
        <p class="text-sm text-[var(--ui-text-muted)]">点击下方按钮一键安装 hermes-agent (PyPI)。安装可能需要 1-3 分钟。</p>
        <UButton color="primary" :loading="loading" @click="installHermes">一键安装</UButton>
      </div>
    </UCard>

    <!-- 步骤 2 -->
    <UCard v-if="currentStep === 2" class="bg-[var(--ui-bg-card)] shadow-sm" :ui="{ root: 'ring-0 divide-y-0', body: 'p-5' }">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-key-round" class="w-5 h-5 text-primary" />
          <span class="font-semibold text-[var(--ui-text)]">步骤 2：选择 Provider</span>
        </div>
      </template>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <div
          v-for="p in providers"
          :key="p.id"
          class="border border-[var(--ui-border)] rounded-lg p-4 cursor-pointer transition-all hover:border-primary"
          :class="selectedProvider === p.id ? 'bg-primary/5 border-primary' : 'bg-[var(--ui-bg-elevated)]/50'"
          @click="selectProvider(p.id)"
        >
          <div class="font-semibold text-[var(--ui-text)]">{{ p.name }}</div>
          <div class="text-xs font-mono text-[var(--ui-text-muted)] mt-1 break-all">{{ p.base_url }}</div>
          <UBadge color="neutral" variant="soft" size="xs" class="mt-2">{{ p.tag }}</UBadge>
        </div>
      </div>

      <div v-if="selectedProviderInfo()" class="bg-[var(--ui-bg-elevated)]/50 border border-[var(--ui-border)] rounded-lg p-4 space-y-4">
        <div class="font-semibold text-[var(--ui-text)]">配置 {{ selectedProviderInfo()?.name }}</div>
        <UFormField label="Base URL" :hint="selectedProviderInfo()?.editable_url ? '可修改为你的实际 endpoint' : '官方默认地址，如需修改请到高级配置'">
          <UInput v-model="providerBaseUrl" :disabled="!selectedProviderInfo()?.editable_url" class="w-full font-mono" />
        </UFormField>
        <UFormField v-if="selectedProviderInfo()?.env_key" label="API Key（可选）" hint="留空则跳过，到 Dashboard 再填">
          <UInput v-model="providerApiKey" type="password" class="w-full" />
        </UFormField>
      </div>

      <div class="flex justify-between mt-4">
        <UButton color="neutral" variant="outline" @click="prevStep">上一步</UButton>
        <UButton color="primary" :disabled="!selectedProvider" :loading="loading" @click="saveProvider">保存并继续</UButton>
      </div>
    </UCard>

    <!-- 步骤 3 -->
    <UCard v-if="currentStep === 3" class="bg-[var(--ui-bg-card)] shadow-sm" :ui="{ root: 'ring-0 divide-y-0', body: 'p-5' }">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-zap" class="w-5 h-5 text-primary" />
          <span class="font-semibold text-[var(--ui-text)]">步骤 3：启动 Gateway</span>
        </div>
      </template>
      <div v-if="gateway?.running" class="space-y-3">
        <UBadge color="success" variant="soft"><UIcon name="i-lucide-activity" class="w-4 h-4 mr-1" />Gateway 运行中</UBadge>
        <div class="text-sm text-[var(--ui-text-muted)]">PID <span class="font-mono text-[var(--ui-text)]">{{ gateway.pid || '-' }}</span></div>
        <div class="flex justify-between">
          <UButton color="neutral" variant="outline" @click="prevStep">上一步</UButton>
          <UButton color="primary" @click="nextStep">下一步</UButton>
        </div>
      </div>
      <div v-else class="space-y-3">
        <UBadge color="neutral" variant="soft"><UIcon name="i-lucide-stop-circle" class="w-4 h-4 mr-1" />未运行</UBadge>
        <p class="text-sm text-[var(--ui-text-muted)]">点击「启动 Gateway」开始运行 Hermes 主进程。</p>
        <div class="flex justify-between">
          <UButton color="neutral" variant="outline" @click="prevStep">上一步</UButton>
          <UButton color="primary" :loading="loading" @click="startGateway">启动 Gateway</UButton>
        </div>
      </div>
    </UCard>

    <!-- 步骤 4 -->
    <UCard v-if="currentStep === 4" class="bg-[var(--ui-bg-card)] shadow-sm" :ui="{ root: 'ring-0 divide-y-0', body: 'p-5' }">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-layout-template" class="w-5 h-5 text-primary" />
          <span class="font-semibold text-[var(--ui-text)]">步骤 4：启动 Dashboard</span>
        </div>
      </template>
      <div v-if="dashboard?.running" class="space-y-3">
        <UBadge color="success" variant="soft"><UIcon name="i-lucide-activity" class="w-4 h-4 mr-1" />Dashboard 运行中</UBadge>
        <div class="text-sm text-[var(--ui-text-muted)]">
          PID <span class="font-mono text-[var(--ui-text)]">{{ dashboard.pid || '-' }}</span>
          端口 <span class="font-mono text-[var(--ui-text)]">{{ dashboard.port || '-' }}</span>
        </div>
        <p class="text-sm text-[var(--ui-text-muted)]">🎉 全部就绪！点击「打开 Dashboard」进入官方 GUI 配置 Provider 与 Channel。</p>
        <div class="flex justify-between">
          <UButton color="neutral" variant="outline" @click="prevStep">上一步</UButton>
          <UButton color="primary" @click="openDashboard">打开 Dashboard</UButton>
        </div>
      </div>
      <div v-else class="space-y-3">
        <UBadge color="neutral" variant="soft"><UIcon name="i-lucide-stop-circle" class="w-4 h-4 mr-1" />未运行</UBadge>
        <p class="text-sm text-[var(--ui-text-muted)]">启动 Dashboard 后即可在浏览器里访问官方 GUI（端口 {{ dashboard?.port || 9119 }}）。</p>
        <div class="flex justify-between">
          <UButton color="neutral" variant="outline" @click="prevStep">上一步</UButton>
          <UButton color="primary" :loading="loading" @click="startDashboard">启动 Dashboard</UButton>
        </div>
      </div>
    </UCard>
  </div>
</template>
