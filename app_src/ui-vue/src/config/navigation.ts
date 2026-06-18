import type { NavigationMenuItem } from '@nuxt/ui'

export interface NavItem {
  label: string
  icon?: string
  to?: string
  children?: NavItem[]
  badge?: string | number
  target?: string
}

export interface NavigationConfig {
  desktop: NavigationMenuItem[][]
  mobile: NavigationMenuItem[]
}

export const navigationConfig: NavigationConfig = {
  desktop: [
    [
      {
        label: '状态总览',
        icon: 'i-lucide-layout-grid',
        to: '/',
      },
      {
        label: '快速向导',
        icon: 'i-lucide-wand-sparkles',
        to: '/wizard',
      },
      {
        label: 'CLI 终端',
        icon: 'i-lucide-terminal',
        to: '/terminal',
      },
      {
        label: '高级配置',
        icon: 'i-lucide-settings',
        to: '/config',
      },
      {
        label: '消息频道',
        icon: 'i-lucide-message-square',
        to: '/channels',
      },
      {
        label: '日志',
        icon: 'i-lucide-file-text',
        to: '/logs',
      },
      {
        label: '关于',
        icon: 'i-lucide-info',
        to: '/about',
      },
    ]
  ],
  mobile: [
    {
      label: '总览',
      icon: 'i-lucide-layout-grid',
      to: '/',
    },
    {
      label: '向导',
      icon: 'i-lucide-wand-sparkles',
      to: '/wizard',
    },
    {
      label: '终端',
      icon: 'i-lucide-terminal',
      to: '/terminal',
    },
    {
      label: '配置',
      icon: 'i-lucide-settings',
      to: '/config',
    },
    {
      label: '更多',
      icon: 'i-lucide-menu',
      to: '/about',
    },
  ]
}
