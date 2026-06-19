<script setup lang="ts">
import { navigationConfig } from '@/config/navigation'
import type { NavigationMenuItem } from '@nuxt/ui'
import { useRoute } from 'vue-router'
import { ref } from 'vue'

const route = useRoute()
const items = ref<NavigationMenuItem[]>(navigationConfig.mobile)

function isItemActive(item: NavigationMenuItem) {
  if (item.to && route.path === item.to) return true
  if (item.children && Array.isArray(item.children)) {
    return item.children.some((child: NavigationMenuItem) => child.to && route.path === child.to)
  }
  return false
}
</script>

<template>
  <nav class="fixed bottom-0 left-0 right-0 z-50 bg-[var(--ui-bg)] border-t border-[var(--ui-border)] safe-area-bottom">
    <div class="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
      <template v-for="item in items" :key="item.label">
        <UDropdownMenu
          v-if="item.children && Array.isArray(item.children)"
          :items="item.children"
          :ui="{ content: 'w-40' }"
          :content="{ side: 'top', sideOffset: 8 }"
        >
          <button
            class="flex flex-col items-center justify-center flex-1 h-full px-1 py-2 transition-colors"
            :class="[
              isItemActive(item)
                ? 'text-[var(--ui-primary)]'
                : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]'
            ]"
          >
            <UIcon
              :name="item.icon || 'i-lucide-circle'"
              class="text-xl mb-1"
            />
            <span class="text-xs font-medium truncate w-full text-center">
              {{ item.label }}
            </span>
          </button>
        </UDropdownMenu>

        <RouterLink
          v-else
          :to="item.to || '#'"
          class="flex flex-col items-center justify-center flex-1 h-full px-1 py-2 transition-colors"
          :class="[
            item.to && route.path === item.to
              ? 'text-[var(--ui-primary)]'
              : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]'
          ]"
        >
          <UIcon
            :name="item.icon || 'i-lucide-circle'"
            class="text-xl mb-1"
          />
          <span class="text-xs font-medium truncate w-full text-center">
            {{ item.label }}
          </span>
        </RouterLink>
      </template>
    </div>
  </nav>
</template>

<style scoped>
.safe-area-bottom {
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
