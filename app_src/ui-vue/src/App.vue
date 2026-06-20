<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { useLogStream } from '@/composables/useLogStream'
import { useToast } from '@nuxt/ui/composables'

useTheme()

// 全局：监听 hermes 后端 warn/error 日志，弹 toast
const stream = useLogStream(0)
const toast = useToast()
let unsub: (() => void) | undefined

onMounted(() => {
  stream.start()
  unsub = stream.onAlert((a) => {
    toast.add({
      title: a.level === 'error' ? '错误' : '警告',
      description: a.text,
      color: a.level === 'error' ? 'error' : 'warning',
      duration: 6000
    })
  })
})

onUnmounted(() => {
  if (unsub) unsub()
  stream.stop()
})
</script>

<template>
  <Suspense>
    <UApp>
      <ResponsiveLayout>
        <RouterView />
      </ResponsiveLayout>
    </UApp>
  </Suspense>
</template>
