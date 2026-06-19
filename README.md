# Hermes for fnOS

[![Version](https://img.shields.io/badge/version-0.23.7-blue)](https://github.com/yaozy2020/com.nousresearch.hermes/releases)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![fnOS](https://img.shields.io/badge/fnOS-%E2%89%A5%201.1.3107-orange)](https://www.fnnas.com/)

将 [Hermes Agent](https://github.com/NousResearch/hermes-agent) 部署到飞牛 NAS 的原生应用包。

## 简介

[Hermes](https://github.com/NousResearch/hermes-agent) 是 Nous Research 开发的自进化 AI Agent 平台 ——「The agent that grows with you」。它具备从经验中创建技能的自学习循环、跨会话持久记忆、200+ 模型支持以及 MCP 扩展生态，可通过 Telegram / Discord / Slack / WhatsApp / Signal 等多渠道接入。

本项目将 Hermes 的 **Gateway**（消息通道）和 **Dashboard**（Web 管理界面）打包为飞牛 NAS（fnOS）原生 fpk 应用，提供轻量控制面板进行进程管理、首次引导配置和状态监控。

> **与官方 Dashboard 的关系**：本面板专注「fnOS 视角」——进程启停、安装引导、配置预设、常用频道一键配置。详细的 Provider / Channel / Skill 配置请打开 Hermes 官方 Dashboard。

## 核心功能

- **现代控制面板** — Bun + Unix socket + fnOS gatewaySocket，无 Docker 依赖；前端基于 Vue 3 + Nuxt UI v4 + TailwindCSS v4 工程化构建，复用 QwenPaw 设计语言
- **4 步快速向导** — 检查 Hermes 安装 → 选择 Provider 预设 → 启动 Gateway → 启动 Dashboard
- **多 Provider 预设** — OpenRouter / OpenCode-Zen / OpenCode-Go / DeepSeek / GLM / Kimi / MiniMax / Anthropic / Gemini / OpenAI，选中后可修改 Base URL 并选填 API Key
- **消息频道管理** — 内置 Telegram / Slack / Discord / QQBot / 企业微信 5 个绿色频道直接表单配置（写 .env，重启 Gateway 立即生效），进阶/外部依赖频道引导跳转 Dashboard
- **状态总览** — Hermes / Gateway / Dashboard / CLI 终端 多进程实时监控，5 秒自动刷新
- **CLI 终端** — 内置 ttyd 浏览器终端，一键运行 `hermes setup / model / login / gateway setup / doctor / status`
- **高级配置** — YAML / ENV 双编辑器，直接编辑 Hermes 配置文件
- **主题跟随飞牛系统** — 读取飞牛桌面写入的 `DesktopConfig-1000` localStorage 配置，自动同步亮暗模式与系统视觉统一；支持 6 种主题色（天空蓝 / 落日橙 / 星云紫 / 极光青 / 玫瑰红 / 系统默认）
- **响应式布局** — 桌面端侧边栏导航 + 移动端底部 Tab 栏，自动适配 1024 / 768 / 380px 断点

## 快速开始

### 前置要求

- 飞牛 NAS 系统 **≥ 1.1.3107**
- 已安装 **Bun**（fnOS 应用商店）和 **Node.js v24**（fnOS 应用商店）

### 安装

1. 从 [Releases](https://github.com/yaozy2020/com.nousresearch.hermes/releases) 下载最新 `.fpk` 安装包
2. 在飞牛应用商店中选择「手动安装」，上传 `.fpk` 文件
3. 安装完成后，在飞牛桌面点击 Hermes 图标打开控制面板
4. 按「快速向导」4 步完成首次配置：
   - **第 1 步**：检查并安装 Hermes（从 PyPI 安装 `hermes-agent`）
   - **第 2 步**：选择 LLM Provider，可修改 Base URL、选填 API Key
   - **第 3 步**：启动 Gateway 消息通道
   - **第 4 步**：启动 Dashboard Web 管理界面

### 依赖说明

安装包会自动处理以下依赖：

- **Bun ≥ 1.3.9** — 控制面板后端运行时
- **Node.js v24** — Hermes Dashboard 前端构建
- **Python 3.12** — Hermes Agent 运行环境（fnOS 自带）

## 项目结构

```
com.nousresearch.hermes/
├── app_src/
│   ├── server/
│   │   ├── index.js           # Bun HTTP server 入口（Unix socket）
│   │   └── modules/           # 模块化后端：config / hermes / logger / static / terminal / utils / version
│   ├── ui/                    # 构建后的控制面板前端（由 build.sh 从 ui-vue 同步）
│   │   ├── index.html
│   │   ├── config             # fnOS UI 配置入口
│   │   └── public/            # JS/CSS/字体构建产物
│   └── ui-vue/                # Vue 3 + Nuxt UI v4 + TailwindCSS v4 源码工程
│       ├── src/
│       │   ├── assets/        # 全局样式
│       │   ├── components/    # DesktopSidebar / MobileTabBar / ResponsiveLayout
│       │   ├── composables/   # useApi / useTheme
│       │   ├── config/        # 导航配置
│       │   ├── pages/         # 状态总览 / 快速向导 / 终端 / 配置 / 频道 / 日志 / 关于
│       │   └── types/         # 前后端共享 API 类型副本
│       ├── public/icons/      # Hermes Agent 品牌 SVG 图标
│       ├── package.json       # Bun 工具链
│       └── vite.config.ts
├── shared/
│   └── api-types.ts           # 前后端共享 API 类型定义
├── cmd/
│   ├── main                   # 主程序入口（启动/停止/状态管理）
│   ├── install_callback       # 安装后回调（创建目录结构）
│   ├── upgrade_callback       # 升级后回调（停旧进程→pip安装→重启）
│   ├── uninstall_init         # 卸载前回调（停服务 + 杀残留进程）
│   ├── uninstall_callback     # 卸载回调（按 wizard 选择删数据）
│   └── config_callback        # 配置变更回调
├── config/
│   ├── resource               # 数据共享目录权限配置
│   ├── privilege              # 应用权限声明
│   └── prompts/SOUL.md        # Hermes 系统提示词
├── wizard/
│   └── uninstall              # 卸载向导
├── manifest                   # 应用清单（名称、版本、描述等）
├── build.sh                   # fpk 打包脚本
├── ICON.PNG / ICON_256.PNG    # 应用图标
└── README.md
```

## 构建

```bash
# 一键打包（自动安装 Bun 前端依赖、构建 Vue 工程、同步到 app_src/ui、生成 fpk）
bash build.sh

# 输出: com.nousresearch.hermes_v<VERSION>.fpk（约 1.2 MB）
```

`build.sh` 会安全地处理 `app_src/ui` 目录：保留 `config` 等运行时文件，只替换前端构建产物，避免误删用户配置。

## 版本历史


### v0.23.7（当前版本）

- **修复高级配置不生效**：配置目录从 `${DATA_DIR}/config` 对齐到 Hermes 实际读取的 `HERMES_HOME`（即 `~/.hermes`）
  - `config.yaml` / `.env` 现在写入 `${HERMES_HOME}/`，保存后重启 Gateway 即可被 Hermes 正确加载
  - 启动时自动把旧位置（`${DATA_DIR}/config/`）的配置迁移到新位置
- **清理 Gateway / Dashboard 环境变量**：移除未使用的 `HERMES_CONFIG`、`HERMES_DATA`、`HERMES_WORKSPACE`，避免误导

### v0.23.6

- **CLI 终端移动端适配**：ttyd 改由主应用统一代理（`/ttyd/*` 反向代理 HTTP + WebSocket），无需直接访问 9123 端口；新增 `/ttyd-mobile` 全屏移动端终端壳；桌面端保留新标签页打开，移动端自动跳转移动壳
- **修复 ttyd 终端黑屏/白屏**：移除 `--once`/`-O` 限制、重写 `Location` 避免 127.0.0.1 跳转、修复 WebSocket subprotocol、自动寻找可用端口、统一带斜杠访问 `/ttyd/`
- **修复版本信息显示**：构建时将 Panel 版本写入 `build-meta.json`，运行时优先读取；Hermes 版本通过 `hermes --version` 异步读取并正则提取纯版本号
- **状态总览增强**：新增 installing 状态、Gateway/Dashboard/Terminal 运行时间、Terminal 状态卡片；未运行改用 power-off 图标，运行中增加心跳动画

| 能力 | v0.22.0 | v0.23.6 |
|------|:-------:|:-------:|
| 前端 UI | Vue 3 + Nuxt UI v4 重构 | 同上 + 状态卡片心跳动画 |
| CLI 终端 | 桌面端新标签页打开 | 桌面端 + 移动端全屏壳 |
| ttyd 连接 | 直接访问 9123 端口 | 主应用 `/ttyd/*` 反向代理 |
| 版本显示 | Panel 可能 unknown | 构建时注入 `build-meta.json`，稳定显示 |
| 安装状态 | 仅显示已安装/未安装 | 增加「安装中…」状态 |
| 进程信息 | PID + 运行中/未运行 | 增加运行时间、Terminal 卡片 |
| 响应式 | 桌面 + 移动布局 | 终端页单独移动端适配 |
### v0.22.0

- **前端 UI 全面重构**：基于 Vue 3 + Nuxt UI v4 + TailwindCSS v4 重写控制面板，复用 QwenPaw 控制台设计语言，视觉与 fnOS 系统更统一
- **工程化治理**：后端 `server/index.js` 按职责拆分为 `modules/{config,hermes,logger,static,terminal,utils,version}.js`；新增 `shared/api-types.ts` 统一前后端类型
- **构建工具链统一为 Bun**：`app_src/ui-vue/` 使用 Bun 安装依赖并构建，产物通过 `build.sh` 安全同步到 `app_src/ui`，避免误删 `config` 等运行时文件
- **状态总览接口增强**：`/api/health` 聚合 Hermes 安装、venv、二进制、Gateway/Dashboard 运行状态与 PID/端口，前端从 4 个并发请求减为 2 个
- **侧边栏品牌升级**：顶部改为官方 Hermes Agent 文字 SVG 图标，颜色随主题主色变化；移除旧侧脸剪影图标及 H 字母临时方案
- **应用图标更新**：`ICON.PNG` / `ICON_256.PNG` 替换为不透明白底 H 艺术字图标，符合 FNOS 应用中心要求
- **构建产物瘦身**：fpk 从约 1.4MB 降至约 950KB

### v0.21.2

- **systemd user unit 主动清理**：`uninstall_init` 扫描 `/root` + `/home/*` + `PKGHOME` 下的 `~/.config/systemd/user/hermes-*.service`，三通道（machinectl / sudo+XDG / 直调）尝试 disable 后再删文件 + 清 wants/requires 软链——解决用户曾在 SSH 跑 `hermes gateway setup` 后无法干净卸载的痛点
- **进程清理升级**：匹配模式从 3 个扩展到 7 个（新增 ttyd / hermes_cli / hermes-gateway / hermes-dashboard）；TERM 后轮询最多 8 秒等优雅退出再 KILL
- 新增 `scripts/hermes_uninstall_verify.sh` 真机验证脚本（snapshot → check keep → check wipe，30 分钟完成往返测试）
- 注：`/vol2/@apphome/<app>/` 4KB 空壳目录由 fnOS 框架管理（独立用户无权删 root 拥有的父目录），不属于残留

### v0.21.1

- 应用商店「安装向导」补全使用声明（3 步）：使用声明 → 推荐使用 CLI 终端初始化 → 确认安装
- 应用商店「升级向导」新增升级说明，明确不会动 venv / `~/.hermes` / Provider 配置 / API Key
- 控制面板「快速向导」顶部新增「使用声明」与「推荐使用 CLI 终端初始化」两块提示 banner
- 引导用户优先使用内置 CLI 终端运行 hermes setup / model / login / gateway setup 等命令，避免本机 Python 冲突

### v0.21.0

- 新增「CLI 终端」Tab：内置 ttyd 1.7.7 静态二进制（1.3 MB），点按钮自动开新标签页运行 hermes setup / model / login / gateway setup / doctor / status，支持 OAuth 设备授权码、API Key 粘贴、密码隐藏输入
- 新增「🔄 重启 Hermes」一键按钮：状态总览页右上角，顺序停 Gateway + Dashboard 后整体重启
- 新增 5 个接口：`/api/terminal/{status,start,stop}` + `/api/hermes/{restart,stop_all}`
- 命令白名单严格限定 6 条 hermes 子命令，无任意命令执行风险
- `cmd/main stop` 时自动清理 ttyd 残留进程

### v0.20.3

- 修复版本号穿帮：`/api/version` 改为运行时从 manifest 动态读取面板版本，不再硬编码
- agent 字段真实化：通过 `hermes --version` 实时探测 venv 内 hermes-agent，未安装时返回 `not_installed`，新增 `agent_installed` 布尔字段
- socket 权限收紧：`com.nousresearch.hermes.sock` 由 0o777 改为 0o660（owner+group only）
- 文案统一：「Hermes 官方 Web 界面」改为「Hermes 官方控制台」

### v0.20.2

- 「消息频道」页面文案统一：所有「Hermes Web UI / 官方 Web UI」按钮和提示替换为「打开 Dashboard」，与首页用语保持一致

### v0.20.1

- 修复卸载脚本：`uninstall_init` 真正停止 bun server / hermes gateway / dashboard 进程并兜底清理 socket+pid 文件
- `uninstall_callback` 正确读取 wizard 选择，「清除所有应用数据」时彻底删除 venv/.hermes/home/config/logs/workspace/runtime/state 等子目录，避免数据残留

### v0.20.0

- 新增「消息频道」Tab，支持 Telegram / Slack / Discord / QQBot / 企业微信 5 个频道直接表单配置（写入 .env，重启 Gateway 立即生效）
- 进阶频道（DingTalk / Feishu / Email / Webhook）和外部依赖频道（Signal / WhatsApp / BlueBubbles / SMS / Matrix / Yuanbao 等）写明依赖并引导用户打开 Dashboard 配置
- LLM Provider 列表精简：删除 OpenAI 兼容 / Ollama / Nous Portal（前者改用 OpenCode Zen/Go，后两者请通过 Dashboard 配置）
- 新增 Google Gemini / 智谱 GLM / Moonshot Kimi / MiniMax 预设
- 关于页新增 Hermes 官方文档与中文社区文档链接

### v0.19.0

- UI 设计系统全面对齐飞牛 Semi Design 色板（grey 系列灰阶 + rgba 透明度边框），视觉与系统原生一致
- 修复主题跟随机制：采用 OpenClaw 同款方案，读取 `localStorage['fnos-theme-mode']` → `body[theme-mode=dark]`，飞牛系统切换亮暗时自动同步
- 监听 `storage` 事件实时响应飞牛主题切换
- 第三颗主题球保留为强制深色 fallback（移动端 iframe localStorage 不可读时使用）
- 圆角从 8px 调整为 6px 匹配 Semi Design 风格

### v0.18.3

- 向导第 2 步：选中 Provider 后可修改 Base URL 并可选填 API Key（自动写入 .env）
- 新增 OpenCode 与 OpenAI 兼容两个 Provider 预设

### v0.18.2

- 移动端快速向导改为竖排布局，每步独占一行不再溢出

### v0.18.1

- 更正本应用 GitHub 地址

### v0.17.0

- UI 全面重构：侧边栏导航 + 4 步快速向导 + 3 列状态卡片 + 高级配置页
- 新增侧边栏顶部 LED 状态指示灯
- 新增中文 i18n 帮助文案
- 移动端抽屉式侧边栏 + 3 级断点响应式

## 常见问题

### Gateway 和 Dashboard 有什么区别？

- **Gateway** — Hermes 的消息通道服务，负责接收 Telegram / Discord / Slack 等渠道的消息并转发给 Agent 处理，以用户进程方式后台运行
- **Dashboard** — Hermes 的 Web 管理界面（端口 9119），用于配置 Provider、Channel、Skill 等详细参数

### 安装后 Hermes 在哪里？

Hermes 安装在独立用户目录下的虚拟环境中：`/vol2/@apphome/com.nousresearch.hermes/data/venv/bin/hermes`

### 如何更新？

在飞牛应用商店中找到 Hermes，点击更新。更新会自动停止旧进程、pip 安装最新版 hermes-agent、然后重启服务。

### 卸载会留下数据吗？

v0.20.1 起卸载向导完整支持「保留 / 清除」两种模式：
- **保留现有文件**：仅停服务并清理 socket/pid，data 目录原样保留
- **清除所有应用数据**：彻底删除 venv、.hermes、config、logs、workspace、runtime、state 等子目录

### 亮暗模式不跟随飞牛系统？

v0.22.0 起控制面板读取飞牛桌面写入的 `DesktopConfig-1000` localStorage 配置自动同步亮暗模式。若切换飞牛系统主题后控制面板未立即变化，请刷新浏览器页面。

## 交流与反馈

- **GitHub Issues**：[提交反馈](https://github.com/yaozy2020/com.nousresearch.hermes/issues)

## 相关链接

| 项目 | 地址 |
|------|------|
| Hermes Agent 原项目 | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) |
| Hermes 官方文档 | [hermes-agent.nousresearch.com/docs](https://hermes-agent.nousresearch.com/docs/) |
| Hermes 中文社区 | [hermesagent.org.cn](https://hermesagent.org.cn/docs/getting-started/installation) |
| 飞牛 NAS 官网 | [fnnas.com](https://www.fnnas.com/) |
| fnOS 开发文档 | [fnnas/fnnas-docs](https://github.com/fnnas/fnnas-docs) |

## 许可证

本项目基于 [MIT](LICENSE) 许可证开源。

Hermes Agent 原项目同样采用 MIT 许可证。
