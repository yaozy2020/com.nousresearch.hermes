<script setup lang="ts">
defineProps<{
  icon: string
  title: string
  statusColor?: 'success' | 'warning' | 'error' | 'neutral' | 'primary'
  statusIcon?: string
  statusText?: string
  statusAnimated?: boolean
}>()
</script>

<template>
  <UCard class="bg-[var(--ui-bg-card)] shadow-sm h-full" :ui="{ root: 'ring-0 divide-y-0 h-full flex flex-col', body: 'p-5 flex-1 flex flex-col' }">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon :name="icon" class="w-5 h-5 text-primary" :class="{ 'animate-pulse': statusAnimated }" />
        <span class="font-semibold text-[var(--ui-text)]">{{ title }}</span>
      </div>
    </template>

    <div class="flex-1 flex flex-col gap-4">
      <div class="flex items-center gap-3 min-h-[28px]">
        <UBadge v-if="statusText" :color="statusColor || 'neutral'" variant="soft" size="md">
          <template #leading>
            <UIcon v-if="statusIcon" :name="statusIcon" class="w-4 h-4" :class="{ 'animate-pulse': statusAnimated }" />
          </template>
          {{ statusText }}
        </UBadge>
        <slot name="status-extra" />
      </div>

      <div class="flex-1">
        <slot />
      </div>

      <div class="flex flex-wrap gap-2 mt-auto">
        <slot name="actions" />
      </div>

      <div v-if="$slots.footer" class="text-xs text-[var(--ui-text-muted)] min-h-[1rem]">
        <slot name="footer" />
      </div>
    </div>
  </UCard>
</template>
