<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/composables/useApi'

interface ChannelField {
  key: string
  label: string
  placeholder?: string
  secret?: boolean
  required?: boolean
}

interface ChannelDef {
  id: string
  name: string
  desc: string
  fields: ChannelField[]
}

interface ChannelData {
  _configured?: boolean
  [key: string]: string | boolean | undefined
}

const toast = useToast()
function notify(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') {
  const color = type === 'error' ? 'error' : type === 'warning' ? 'warning' : type === 'success' ? 'success' : 'neutral'
  const icon = type === 'error' ? 'i-lucide-x-circle' : type === 'warning' ? 'i-lucide-alert-triangle' : type === 'success' ? 'i-lucide-check-circle' : 'i-lucide-info'
  toast.add({ title: message, color, icon })
}

const channelsDef: ChannelDef[] = [
  {
    id: 'telegram',
    name: 'Telegram',
    desc: '@BotFather 创建 Bot 获取 token',
    fields: [
      { key: 'TELEGRAM_BOT_TOKEN', label: 'Bot Token *', placeholder: '123456:AAxxx...', secret: true, required: true },
      { key: 'TELEGRAM_ALLOWED_USERS', label: '允许的用户 ID（逗号分隔）', placeholder: '12345678,87654321' },
      { key: 'TELEGRAM_HOME_CHANNEL', label: '默认频道 / 用户 ID', placeholder: '12345678' },
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    desc: 'Slack App → OAuth → Bot User OAuth Token',
    fields: [
      { key: 'SLACK_BOT_TOKEN', label: 'Bot Token *', placeholder: 'xoxb-...', secret: true, required: true },
      { key: 'SLACK_HOME_CHANNEL', label: '默认频道 ID', placeholder: 'C0123456789' },
    ],
  },
  {
    id: 'discord',
    name: 'Discord',
    desc: 'Discord Developer Portal → Bot Token',
    fields: [
      { key: 'DISCORD_BOT_TOKEN', label: 'Bot Token *', placeholder: 'MTAxxx...', secret: true, required: true },
      { key: 'DISCORD_HOME_CHANNEL', label: '默认频道 ID', placeholder: '1234567890' },
    ],
  },
  {
    id: 'qqbot',
    name: 'QQ 机器人（官方 API）',
    desc: 'QQ 开放平台 → 机器人管理',
    fields: [
      { key: 'QQ_APP_ID', label: 'App ID *', placeholder: '102000xxx', required: true },
      { key: 'QQBOT_TOKEN', label: 'Token *', placeholder: 'xxxxxxxx', secret: true, required: true },
      { key: 'QQBOT_HOME_CHANNEL', label: '默认群 ID', placeholder: '12345678' },
    ],
  },
  {
    id: 'wecom',
    name: '企业微信（机器人）',
    desc: '企业微信群 → 添加群机器人 → Webhook URL 中的 key',
    fields: [
      { key: 'WECOM_BOT_ID', label: 'Bot Key *', placeholder: 'xxxxxxx-xxxx-xxxx', secret: true, required: true },
      { key: 'WECOM_HOME_CHANNEL', label: '默认群（可选）', placeholder: 'group_id' },
    ],
  },
]

const channelValues = ref<Record<string, ChannelData>>({})
const loading = ref(false)

async function loadChannels() {
  loading.value = true
  try {
    const r = await api<{ channels?: Record<string, ChannelData> }>('api/channels')
    channelValues.value = r.channels || {}
  } catch (e: unknown) {
    const err = e as Error
    notify('加载频道失败: ' + (err?.message ?? String(e)), 'error')
  } finally {
    loading.value = false
  }
}

async function saveChannel(id: string) {
  const def = channelsDef.find(c => c.id === id)
  if (!def) return

  const values: Record<string, string> = {}
  for (const f of def.fields) {
    const input = document.getElementById(`ch_${id}_${f.key}`) as HTMLInputElement | null
    const v = input?.value.trim() || ''
    if (f.required && !v) {
      notify(`${f.label} 为必填项`, 'warning')
      input?.focus()
      return
    }
    if (v) values[f.key] = v
  }

  try {
    const r = await api<{ ok: boolean; error?: string }>(`api/channels/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    if (r.ok) {
      notify('已保存，重启 Gateway 生效', 'success')
      loadChannels()
    } else {
      notify(r.error || '保存失败', 'error')
    }
  } catch (e: unknown) {
    const err = e as Error
    notify('保存失败: ' + (err?.message ?? String(e)), 'error')
  }
}

async function deleteChannel(id: string) {
  if (!confirm('确定清空该频道的配置？')) return
  try {
    const r = await api<{ ok: boolean; error?: string }>(`api/channels/${id}`, { method: 'DELETE' })
    if (r.ok) {
      notify('已清空，重启 Gateway 生效', 'success')
      loadChannels()
    } else {
      notify(r.error || '清空失败', 'error')
    }
  } catch (e: unknown) {
    const err = e as Error
    notify('清空失败: ' + (err?.message ?? String(e)), 'error')
  }
}

function fieldValue(chanId: string, key: string): string {
  const cur = channelValues.value[chanId] || {}
  const v = cur[key]
  return typeof v === 'string' ? v : ''
}

function isConfigured(chanId: string): boolean {
  return !!channelValues.value[chanId]?._configured
}

onMounted(loadChannels)
</script>

<template>
  <div class="mx-auto space-y-6">
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 class="text-3xl font-bold text-[var(--ui-text)]">消息频道</h1>
        <p class="text-[var(--ui-text-muted)] mt-2">配置 Hermes Gateway 的消息接入渠道</p>
      </div>
      <UButton color="primary" icon="i-lucide-layout-template" @click="$router.push('/config')">高级配置</UButton>
    </div>

    <UAlert color="warning" variant="soft" icon="i-lucide-info" title="注意"
      description="填写后保存即写入 .env，需重启 Gateway 生效。复杂频道（OAuth/外部服务）请打开 Dashboard 配置。" />

    <div class="space-y-4">
      <UCard
        v-for="c in channelsDef"
        :key="c.id"
        class="bg-[var(--ui-bg-card)] shadow-sm"
        :ui="{ root: 'ring-0 divide-y-0', body: 'p-5' }"
      >
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-message-square" class="w-5 h-5 text-primary" />
              <span class="font-semibold text-[var(--ui-text)]">{{ c.name }}</span>
              <span class="text-sm text-[var(--ui-text-muted)]">{{ c.desc }}</span>
            </div>
            <UBadge :color="isConfigured(c.id) ? 'success' : 'neutral'" variant="soft" size="sm">
              {{ isConfigured(c.id) ? '已配置' : '未配置' }}
            </UBadge>
          </div>
        </template>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <UFormField v-for="f in c.fields" :key="f.key" :label="f.label">
            <UInput
              :id="`ch_${c.id}_${f.key}`"
              :type="f.secret ? 'password' : 'text'"
              :placeholder="f.placeholder"
              :model-value="fieldValue(c.id, f.key)"
              class="w-full"
            />
          </UFormField>
        </div>
        <div class="flex gap-2 mt-4">
          <UButton color="primary" size="sm" :loading="loading" @click="saveChannel(c.id)">保存</UButton>
          <UButton v-if="isConfigured(c.id)" color="neutral" variant="ghost" size="sm" @click="deleteChannel(c.id)">清空</UButton>
        </div>
      </UCard>
    </div>

    <UCard class="bg-[var(--ui-bg-card)] shadow-sm" :ui="{ root: 'ring-0 divide-y-0', body: 'p-5' }">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-alert-circle" class="w-5 h-5 text-warning" />
          <span class="font-semibold text-[var(--ui-text)]">进阶频道（需配置文件 + 引导）</span>
        </div>
      </template>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="p-3 bg-[var(--ui-bg-elevated)]/50 border border-[var(--ui-border)] rounded-lg">
          <div class="font-medium text-[var(--ui-text)]">DingTalk 钉钉</div>
          <div class="text-xs text-[var(--ui-text-muted)] mt-1">需在钉钉开放平台注册应用，配置 OAuth 回调 URL。</div>
        </div>
        <div class="p-3 bg-[var(--ui-bg-elevated)]/50 border border-[var(--ui-border)] rounded-lg">
          <div class="font-medium text-[var(--ui-text)]">Feishu 飞书</div>
          <div class="text-xs text-[var(--ui-text-muted)] mt-1">需企业自建应用 + 事件订阅回调。</div>
        </div>
        <div class="p-3 bg-[var(--ui-bg-elevated)]/50 border border-[var(--ui-border)] rounded-lg">
          <div class="font-medium text-[var(--ui-text)]">Email 邮件</div>
          <div class="text-xs text-[var(--ui-text-muted)] mt-1">SMTP/IMAP 多字段配置。</div>
        </div>
        <div class="p-3 bg-[var(--ui-bg-elevated)]/50 border border-[var(--ui-border)] rounded-lg">
          <div class="font-medium text-[var(--ui-text)]">Webhook</div>
          <div class="text-xs text-[var(--ui-text-muted)] mt-1">需在 config.yaml 定义路由及 HMAC 密钥。</div>
        </div>
      </div>
    </UCard>
  </div>
</template>
