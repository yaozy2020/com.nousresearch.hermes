import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueRouter from 'vue-router/vite'
import ui from '@nuxt/ui/vite'
import { fileURLToPath, URL } from 'node:url'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // 生产环境使用 fnOS 网关绝对路径，避免无尾斜杠访问时相对路径解析错误
  const basePath = env.VITE_BASE_PATH || (mode === 'production' ? '/app/com-nousresearch-hermes/' : './')

  return {
    plugins: [
      vueRouter({
        dts: 'src/route-map.d.ts'
      }),
      vue(),
      ui({
        theme: {
          colors: [
            'primary',
            'secondary',
            'success',
            'info',
            'warning',
            'error',
            'neutral',
            'fnui'
          ]
        },
        ui: {
          colors: {
            primary: 'fnui',
            neutral: 'slate'
          }
        }
      })
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    base: basePath,
    build: {
      outDir: resolve(__dirname, 'dist'),
      emptyOutDir: true,
      assetsDir: 'public',
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },
  }
})
