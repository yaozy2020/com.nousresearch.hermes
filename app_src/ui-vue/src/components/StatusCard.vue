<script setup lang="ts">
withDefaults(
  defineProps<{
    icon: string
    title: string
    badge?: string
    subtitle?: string
    color?: 'success' | 'warning' | 'error' | 'neutral' | 'primary'
    animated?: boolean
  }>(),
  { color: 'neutral' }
)
</script>

<template>
  <UCard class="bg-[var(--ui-bg-card)] shadow-sm h-full" :ui="{ root: 'ring-0 divide-y-0 h-full flex flex-col', body: 'p-4 flex-1 flex flex-col' }">
    <div class="flex items-start gap-4">
      <div
        class="relative shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center"
        :class="color === 'success' ? 'bg-success/10' : color === 'warning' ? 'bg-warning/10' : color === 'error' ? 'bg-error/10' : color === 'primary' ? 'bg-primary/10' : 'bg-[var(--ui-bg-elevated)]'"
      >
        <UIcon
          :name="icon"
          class="w-7 h-7"
          :class="color === 'success' ? 'text-success' : color === 'warning' ? 'text-warning' : color === 'error' ? 'text-error' : color === 'primary' ? 'text-primary' : 'text-[var(--ui-text-muted)]'"
        />
        <span
          class="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[var(--ui-bg-card)]"
          :class="color === 'success' ? 'bg-success' : color === 'warning' ? 'bg-warning' : color === 'error' ? 'bg-error' : color === 'primary' ? 'bg-primary' : 'bg-[var(--ui-text-muted)]'"
        />
      </div>
      <div class="flex-1 min-w-0 pt-0.5">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-lg font-semibold text-[var(--ui-text)]">{{ title }}</span>
          <UBadge v-if="badge" :color="color" variant="soft" size="xs">{{ badge }}</UBadge>
        </div>
        <p v-if="subtitle" class="text-sm text-[var(--ui-text-muted)] mt-1 whitespace-pre-line leading-snug">{{ subtitle }}</p>
      </div>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap justify-end gap-2 mt-auto pt-4">
      <slot name="actions" />
    </div>
  </UCard>
</template>
