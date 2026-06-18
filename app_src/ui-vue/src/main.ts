import './assets/css/main.css'

import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { routes, handleHotUpdate } from 'vue-router/auto-routes'
import ui from '@nuxt/ui/vue-plugin'

import App from './App.vue'

const app = createApp(App)

// 兼容 fnOS 应用网关：URL 可能无尾斜杠，router base 必须带网关前缀
const m = typeof window !== 'undefined' ? window.location.pathname.match(/^(\/app\/[^/]+)/) : null
const basePath = m ? (m[1] + '/') : import.meta.env.BASE_URL

const router = createRouter({
  routes,
  history: createWebHistory(basePath)
})

app.use(router)
app.use(ui)

app.mount('#app')

if (import.meta.hot) {
  handleHotUpdate(router)
}
