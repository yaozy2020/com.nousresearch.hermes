# Hermes for fnOS

[![Version](https://img.shields.io/badge/version-0.31.0-blue)](https://github.com/yaozy2020/com.nousresearch.hermes/releases/tag/v0.31.0)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![fnOS](https://img.shields.io/badge/fnOS-%E2%89%A5%201.1.3107-orange)](https://www.fnnas.com/)

将 [Hermes Agent](https://github.com/NousResearch/hermes-agent) 部署到飞牛 NAS 的原生应用包。

## 简介

[Hermes](https://github.com/NousResearch/hermes-agent) 是 Nous Research 开发的 AI Agent 平台，支持自学习循环、跨会话持久记忆、200+ 模型和 MCP 扩展生态，可通过 Telegram / Discord / Slack / WhatsApp / Signal 等渠道接入。

本项目将 Hermes 的 Gateway（消息通道）和 Dashboard（Web 管理界面）打包为飞牛 NAS（fnOS）原生 fpk 应用，提供轻量控制面板进行进程管理、首次引导配置和状态监控。面板专注「fnOS 视角」——进程启停、安装引导、配置预设、常用频道一键配置。详细的 Provider / Channel / Skill 配置请打开 Hermes 官方 Dashboard。

## 核心功能

- **Bun + Unix socket 后端**：无 Docker 依赖，通过 fnOS gatewaySocket 通信；前端 Vue 3 + Nuxt UI v4 + TailwindCSS v4 工程化构建
- **4 步快速向导**：检查 Hermes 安装 → 选择 Provider 预设 → 启动 Gateway → 启动 Dashboard
- **多 Provider 预设 + 自定义层**：内置 OpenRouter / OpenCode-Zen / OpenCode-Go / DeepSeek / GLM / Kimi / MiniMax / Anthropic / Gemini / OpenAI 等 11 个预设，支持通过 `/api/providers/user` 叠加自定义 Provider
- **消息频道管理**：Telegram / Slack / Discord / QQBot / 企业微信 5 个绿色频道直接表单配置（写 `.env`，重启 Gateway 生效）；进阶频道引导跳转官方 Dashboard
- **状态总览 + 健康自检**：Hermes / Gateway / Dashboard / CLI 终端多进程实时监控，5 秒自动刷新；`/api/diagnostics` 一次性 8 项检查（Bun / hermes-agent / 进程 / Provider Key / 监听模式 / ttyd），异常自动 toast 推送
- **CLI 终端（移动端优化）**：内置 ttyd 浏览器终端，双排移动工具栏：行 1 特殊键（Ctrl+C / Tab / Esc / ↑↓←→），行 2 工具按钮（A± / 复制屏 / 链接提取 / 粘贴）；`safe-area-inset-bottom` 适配
- **备份 / 还原**：`/api/backup/list | create | restore | {id}` 一键打包 `.env` / `config.yaml` / `.hermes-config` / `channels`，毫秒级时间戳防冲突，restore 前自动 safety backup
- **OpenAPI 3.1 + 内嵌 Swagger UI**：`/api/diagnostics/openapi` 出 spec，`/api/docs` 提供无 CDN 依赖的端点列表
- **SHA256 信任清单**：`/api/trust/list | add | delete`，hex 严格校验 + 自动小写归一
- **i18n 框架**：`server/modules/i18n.js` + `zh-CN.json` 字典加载，`HERMES_LOCALE` 环境变量切换语言
- **主题跟随飞牛系统**：读取 `DesktopConfig-1000` localStorage 配置，自动同步亮暗模式；支持 6 种主题色
- **响应式布局**：桌面端侧边栏导航 + 移动端底部 Tab 栏，自动适配 1024 / 768 / 380px 断点

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

### v0.31.0（当前版本）

API token 鉴权 + rate limit + GitHub fallback 默认禁用。

**API token 鉴权（默认关闭）**：
- `app_src/server/modules/auth.js` — SHA-256 哈希 + 恒等时间比较，token 仅显示一次
- 启用方式：「关于」页 →「API 鉴权」→ 启用 → 生成 64 字符随机 token，自动写入 `${HERMES_HOME}/.env` 的 `HERMES_API_TOKEN` 字段
- 客户端通过 `Authorization: Bearer <token>` 或 `X-Hermes-Token: <token>` 携带
- 三种忘记 token 的恢复方式：
  1. **应用内重置**：「API 鉴权」面板「重置 Token」按钮
  2. **SSH 命令**：`/vol2/@apphome/com.nousresearch.hermes/cmd/main reset-token`
  3. **兜底文件标记**：在 `${HERMES_HOME}/.reset_token` 创建空文件，下次启动自动清空 token

**Rate limit**：
- `app_src/server/modules/rate-limit.js` — 基于 IP 的内存令牌桶
- 通用 API：每 IP 300/min（429 响应）
- 鉴权失败专项：连续 5 次失败 → 该 IP 锁 15 分钟

**安全收敛**：
- `HERMES_NO_FALLBACK` 默认行为反转：现在**默认禁用** GitHub fallback，需 `HERMES_ALLOW_GH_FALLBACK=1` 显式启用
- 旧 `HERMES_NO_FALLBACK=1` 仍兼容（且优先生效），向后兼容

**前端**：
- `useApi.ts` 新增 `getApiToken/setApiToken/clearApiToken`，自动注入 `Authorization: Bearer`，401 时自动清缓存
- 「关于」页新增「API 鉴权」UCard：状态徽标 / 启用按钮 / 重置 / 关闭 / Token 显示与复制 / 手动配置 / 折叠的「忘记 token 怎么办」3 步说明

**测试**：
- 新增 `tests/auth.test.js`（13 用例）+ `tests/rate-limit.test.js`（7 用例）
- 总测试 103/103 通过

### v0.30.8

版本治理 / 仓库结构整理 / 文档自动化。

**版本号 SSOT（单一真相源）**：
- 删除 `config/hermes-version.env`，`manifest` 成为版本号唯一权威源
- `cmd/install_callback` 移除硬编码兜底 `:-0.30.3`，改为 `:-unknown`，让漏读 manifest 的故障醒目
- 新增 `scripts/sync-version.py`：从 manifest 自动同步到 `package.json` / `build-meta.json` / README badge / README "（当前版本）" 标题 / `AUDIT_REPORT.md`
- 新增 `scripts/preflight.sh`：发版前一致性门禁（版本号 / 仓库残留 / 弃用文件 / cmd 兜底）
- `build.sh` 与 CI 在打包前自动调用 sync + preflight

**文档自动化**：
- `AUDIT_REPORT.md` 不再人写，由 `scripts/gen-audit.py` 从代码事实自动生成（测试用例数 / 模块清单 / git tag）
- 新增 `CONTRIBUTING.md`：开发流程、版本号治理、fnOS 平台特性
- 新增 `.github/ISSUE_TEMPLATE/{bug,feature}.md` 与 `.github/PULL_REQUEST_TEMPLATE.md`

**仓库结构整理**：
- `RELEASE_NOTES_*.md` 移至 `docs/release-notes/`
- `SECURITY_AUDIT_v0.25.6.md` / `SECURITY_ROADMAP.md` 移至 `docs/security/`
- `INSTALL_CHECKLIST.md` 移至 `docs/`
- 删除 3 个 orphan `*.fpk.sha256` 文件，`.gitignore` 加 `*.sha256`

**细节修正**：
- `cmd/upgrade_init` 标记名 `.qwenpaw_keep_runtime` → `.hermes_keep_runtime`（语义对齐）

### v0.30.7

UI 修复：把 Dashboard 端口/访问模式控件从 StatusCard 内部抽到状态卡片下方独立 UCard，宽屏横排、移动端竖排，彻底解决 4 列网格里 details slot 文字塌缩成一字一行的问题。

### v0.30.6

状态总览端口/模式快速管理 + 修复 v0.30.5 端口不生效 bug：
- 修复 `DASHBOARD_PORT` 模块加载时被冻结导致面板内改端口不生效，改为每次 `startDashboard()` 重读 `.env`
- 新增 `/api/settings/dashboard-mode` 切换本地 / 外部访问
- StatusCard 卡片新增"访问模式 USwitch"+ 端口编辑框，修改后自动重启 Dashboard 立即生效
- StatusCard 组件支持 details slot 与 subtitle 共存

### v0.30.5

应用设置 WebUI 端口配置 + 治理收尾：
- 新增 `/api/settings/dashboard-port`，应用设置页可直接修改 Dashboard 端口并自动重启
- `build.sh` 自动同步 manifest 版本到 package.json，并在打包后自动计算 fpk SHA256 注入 manifest checksum
- "打开 Dashboard" 按钮在非本地访问模式下显示 ⚠️ 红色"未加密"角标，配合 toast 风险提示

### v0.30.4

manifest 字段对齐 + 字段补齐：
- 新增 `service_port=9119`、`disable_authorization_path=false`、`checksum`
- 生命周期脚本补齐：`cmd/install_init` / `cmd/upgrade_init` / `cmd/config_callback`
- 新增 `AUDIT_REPORT.md` 基础模板

### v0.27.0

健康自检、API 路径兼容、CI 工作流与中文乱码修复：

- **状态总览健康自检**：新增 `GET /api/diagnostics` 一次性检查 8 项（Bun、hermes-agent、Gateway / Dashboard 进程、Provider Key / 选择、监听模式、ttyd 二进制）；首页一个按钮触发，OK / 警告 / 错误三色展开。
- **API base 鲁棒化**：`index.html` 启动时把推断到的网关前缀写入 `<meta name="hermes-api-base">`，`useApi` / `useLogStream` 优先读 meta，回落 URL 正则；fnOS 网关路径变化时不会再 fetch 拼错。
- **CI / Release 工作流**：`.github/workflows/ci.yml` 在 PR / push 上跑 lint + test + Vue 构建；`.github/workflows/release.yml` 在 tag 推送时自动构建并发版（fnpack 不可用时降级为告警，仍可手动 release）。
- **lint:server 扩展**：从单文件升级为遍历 `app_src/server/modules/*.js` 做语法检查。
- **测试增强**：新增 `tests/providers-json.test.js`（schema 校验）与 `tests/integration-server.test.js`（Bun 起 unix socket 端到端，无 bun 自动跳过）。
- **修复 fnOS App WebView 中文乱码**：根因 fnOS service 启动 bun 1.3.9 时按 latin-1 解码 utf-8 源（同一 binary 同 env，仅 UID 不同就行为不同）；通过 `scripts/native2ascii.py` + build.sh hook 在打包时把所有 `server/**/*.js` 非 ASCII 字符转 `\uXXXX` 转义彻底绕过。

### v0.26.6 ~ v0.26.8

安全收敛与体验细节优化：
- **终端边界明确化**：`/api/terminal/send` 增加 4KB 长度限制，并在源码注释中明示「白名单只在 ttyd 启动时校验 argv，启动后子命令的交互式输入由该子命令自身负责」。
- **卸载日志收敛**：`cmd/uninstall_callback` 默认关闭 `set -x`（仅 `HERMES_DEBUG=1` 时启用），日志文件权限从 666 降到 600，避免环境变量泄露到 `/tmp`。
- **PyPI 回退显式化**：Hermes 安装失败时，回退到官方 GitHub 源前会主动广播提示；可设 `HERMES_NO_FALLBACK=1` 在限网/安全场景下关闭回退。
- **日志清理节流**：`logger.js` 中旧日志清理改为每 6 小时执行一次，避免每次写日志都做 `readdirSync + statSync` 全扫描。

### v0.26.5

修复卸载后重装仍显示旧版本的问题：
- 修正 `cmd/uninstall_callback` 的安全路径白名单，匹配 fnOS 真实 `TRIM_PKGHOME=/vol2/@apphome/<pkg>`，不再误判为不安全路径。
- 默认删除运行环境，保留配置文件，避免 venv / runtime / state / logs 残留导致重装后状态异常。
- 卸载调试日志改为每次 `mktemp` 独立文件并 `chmod 666`，避免固定日志文件被当前用户占用导致应用用户无法写入。
- 保留对旧版 `wizard_keep_config` / `wizard_keep_runtime` / `wizard_delete_data` 的兼容。

### v0.26.4

重新设计卸载向导，降低误操作：
- 合并为「保留用户数据」和「确认删除用户数据」两个开关，默认保留数据，重装后可自动恢复。
- 卸载脚本增加更清晰的日志，明确是否进入删除分支。
- 保留对旧版 `wizard_keep_config` / `wizard_keep_runtime` / `wizard_delete_data` 的兼容。

### v0.26.3

修复桌面端图标显示：在 `app/ui/images/` 补齐 `icon_64.png` / `icon_256.png`，并将 `app/ui/config` 图标路径改为 `images/icon_{0}.png`（与 QwenPaw 一致）。

### v0.26.2

卸载向导默认值回退为保留：保留配置 / 保留运行环境开关默认勾选，避免用户误卸载损失数据；仍可通过手动关闭开关实现彻底删除。

### v0.26.1

卸载向导默认值修正：保留配置 / 保留运行环境开关默认不勾选，避免点击卸载后仍残留 venv 与配置。

### v0.26.0

治理系列最终合并版：合并 v0.25.4 ~ v0.25.8 全部安全加固与工程质量改进，包含终端沙箱、CSRF 收紧、安装包来源限制、敏感文件 0o640/0o750 权限、日志按天轮转、前后端 API 类型检查、统一错误处理、非法 JSON 400、静态目录 404、Dashboard 一键锁本地、频道页 v-model 校验等。

### v0.25.8

P1/P2 工程质量与 UX 收尾：

- **进程管理**：`cmd/main` 直接启动 `bun`，避免 bash 子进程残留，PID 与真实进程一致
- **请求体校验**：`parseBody` 对非法 JSON 返回 `400 invalid_body`，不再静默吞错
- **静态文件**：目录请求返回 404，避免泄露目录存在性
- **频道配置页**：改用 `v-model` 绑定，保存前做必填字段实时校验与红色高亮
- **Dashboard 模式提示**：首页状态卡片显示「外部访问模式」/「本地安全模式」，并新增「锁为本地」一键切换按钮
- **版本同步**：manifest / package.json / README 统一为 v0.25.8

### v0.25.7

治理与安全加固：

- **CSRF 校验收紧**：删除“只要是私有 IP 就放行”的兜底逻辑，`Origin: null` 写操作直接拒绝；写接口仅允许与 `Host` 头部匹配的来源（含 `HERMES_TRUSTED_HOSTS` 配置）
- **Hermes 安装包来源限制**：默认只允许 `hermes-agent` 与官方 Git 源；自定义源需显式设置 `HERMES_ALLOW_CUSTOM_PACKAGE=1`，且仍禁止 shell 元字符、`file://`、pip 选项等危险输入
- **终端 framing 保护**：`/ttyd*` 响应增加 `X-Frame-Options: DENY` 与 `CSP: frame-ancestors 'self'`，并对 GET 请求校验来源，防止点击劫持
- **卸载向导升级**：参考 QwenPaw 提供“保留配置文件 / 保留运行环境 / 确认卸载”三个独立开关，避免误删 venv 或配置
- **文档同步**：README badge 与版本历史更新到 v0.25.7

### v0.25.4

- **状态总览 Terminal 卡片增加停止按钮**：可直接在首页停止 ttyd 终端进程
- **配置页增加 Dashboard 不安全模式步骤提示**：在 `.env` 编辑框下方直接展示开启外部访问的 4 步操作

### v0.25.3

- 同步 README 与面板提示文案，明确 Dashboard 不安全模式开启步骤

### v0.25.2

安全加固与稳定性改进：

- **Web 终端沙箱化**：新增受限命令包装器 `terminal-shell.js`，ttyd 仅允许执行白名单 `hermes` 子命令，禁止 shell 元字符与任意命令注入；修复 Ctrl+C 不能正常中断的问题
- **敏感配置脱敏**：`.env` 中 API Key / Token / Secret 等敏感值返回前端时显示为 `__MASKED__`，未修改时保留原值；频道表单已使用密码输入框
- **Dashboard 安全模式**：默认绑定 `127.0.0.1`，不直接暴露无认证 Dashboard 到网络；如需外部访问，请在 `.env` 中显式设置 `HERMES_DASHBOARD_INSECURE=1` 并重启应用
- **端口冲突检测**：启动 Dashboard 前检测端口占用，被占用时给出明确错误
- **API 来源校验**：所有写操作与终端路径增加 `Origin` / `Referer` 校验，防止跨站请求伪造
- **静态文件路径安全**：`serveStatic` 改用 `resolve` + 前缀白名单，彻底防御目录穿越
- **卸载安全加固**：删除数据前校验路径必须位于 `/var/apps/` 或 `/vol2/@apphome/`，防止误删系统目录
- **进程管理加锁**：`isGatewayRunning` / `isDashboardRunning` 增加 `/proc/<pid>/cmdline` 进程名校验，避免旧 PID 指向其他进程
- **日志轮转**：`gateway.log` 按天分割为 `gateway-YYYY-MM-DD.log`，自动保留最近 7 天

### v0.24.1

v0.24 系列正式版，在 v0.23.9 基础上进一步打磨移动端体验、安装向导与信息展示：

- **CLI 终端移动端快捷键后端代理**：前端不再依赖 xterm iframe 注入，改走 `/api/terminal/send` 转发输入帧；`Ctrl+C` 改走 `/api/terminal/signal` 向 ttyd 子进程发送 `SIGINT`，可真正中断命令；修复 HTML `data-seq` 中 `\uXXXX` 被当普通字符的问题
- **状态卡片 QwenPaw 服务风格**：统一左侧圆角图标区 + 状态点 + 标题/Badge/副标题，卡片等高开齐；已安装 Hermes 时同时显示 Hermes 版本与 Dashboard 版本
- **桌面端桌面图标修复**：`ICON.PNG` / `ICON_256.PNG` 转换为 16-bit RGBA，解决 fnOS 桌面渲染占位图的问题
- **应用商店安装向导增强**：支持自定义 Dashboard 端口（默认 9119，留空走默认）；新增 pip 源选择步骤（默认清华源），安装时写入 `.env` 并在面板一键安装 `hermes-agent` 时生效
- **关于页信息补全**：新增 Dashboard 版本行；新增 Venv / 数据目录显示；主题色提示仅在用户主动切换时弹出，避免每次进入关于页都弹窗
- **移动端底部导航优化**：「更多」改为下拉菜单，包含消息频道 / 日志 / 关于，解决原先只能跳转到关于的问题
- **版本信息显示修复**：后端 `getVersion()` 返回 `venv` 与 `dataDir`，避免关于页显示为 `-`

### v0.23.9

0.23.x 统一版本，集中包含以下改进与修复：

- **CLI 终端移动端适配**：ttyd 改由主应用统一代理（`/ttyd/*` 反向代理 HTTP + WebSocket），无需直接访问 9123 端口
- **新增移动端全屏终端壳**：`/ttyd-mobile` 针对小屏优化 viewport、安全区、字体与工具条
- **特殊键工具条**：支持 Ctrl+C / Tab / Esc / 方向键 / 粘贴，解决手机浏览器缺少功能键的痛点
- **修复 ttyd 终端黑屏/白屏**：移除 `--once`/`-O` 限制、重写 `Location` 避免 127.0.0.1 跳转、修复 WebSocket subprotocol、自动寻找可用端口、统一带斜杠访问 `/ttyd/`
- **修复版本信息显示**：构建时将 Panel 版本写入 `build-meta.json`；Hermes 版本通过 `hermes --version` 异步读取并正则提取纯版本号
- **状态总览增强**：新增 installing 状态、Gateway/Dashboard/Terminal 运行时间、Terminal 状态卡片
- **修复高级配置不生效**：配置目录对齐到 Hermes 实际读取的 `HERMES_HOME`（`~/.hermes`），保存 `config.yaml` / `.env` 后重启 Gateway 即可生效；启动时自动迁移旧配置
- **安装向导改进**：步骤 3/4 增加「上一步」按钮
- **状态卡片视觉统一**：4 张卡片等高开齐，路径单行截断显示；未运行改用 power-off 图标，运行中 activity 图标增加心跳动画

| 能力 | v0.22.0 | v0.23.9 |
|------|:-------:|:-------:|
| 前端 UI | Vue 3 + Nuxt UI v4 重构 | 同上 + 状态卡片统一布局 |
| CLI 终端 | 桌面端新标签页打开 | 桌面端 + 移动端全屏壳 + 特殊键工具条 |
| ttyd 连接 | 直接访问 9123 端口 | 主应用 `/ttyd/*` 反向代理 |
| 版本显示 | Panel 可能 unknown | 构建时注入 `build-meta.json`，稳定显示 |
| 安装状态 | 仅显示已安装/未安装 | 增加「安装中…」状态 |
| 进程信息 | PID + 运行中/未运行 | 增加运行时间、Terminal 卡片 |
| 配置生效 | 高级配置写入错误路径 | 对齐 `HERMES_HOME`，保存后生效 |
| 响应式 | 桌面 + 移动布局 | 终端页单独移动端适配、向导可返回 |

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

v0.25.7 起卸载向导支持三个独立开关：
- **保留配置文件**：保留 `config/`、`home/` 与根目录 `.env`
- **保留运行环境**：保留 `venv/`、`install/`、`workspace/`、`runtime/`、`state/`、`logs/` 与 `.hermes_*`
- **确认卸载**：必须开启后才会执行删除

旧版「保留 / 清除」两种模式仍兼容。

### Dashboard 默认是安全模式吗？

v0.25.7 起，为适配 NAS 局域网使用场景，Dashboard **默认**绑定 `0.0.0.0:9119`（`HERMES_DASHBOARD_INSECURE=1`），安装后可直接在局域网浏览器访问 `http://nas:9119`。

如果你希望回到仅本机访问的安全模式：

1. 打开 Hermes 面板 → **配置**
2. 将 `.env` 中的 `HERMES_DASHBOARD_INSECURE=1` 改为 `HERMES_DASHBOARD_INSECURE=0`
3. 点「保存」
4. 到 **fnOS 应用中心**停止并重新启动 Hermes 应用

> ⚠️ 注意：默认模式下 Dashboard 绑定 `0.0.0.0:9119` 且无认证，建议仅在受信任的家庭内网使用；公网映射或多人共用网络请锁回 `HERMES_DASHBOARD_INSECURE=0`。

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

### 前端技术栈

| 项目 | 地址 |
|------|------|
| Vue 3 | [vuejs.org](https://vuejs.org/) |
| Nuxt UI v4 | [ui.nuxt.com](https://ui.nuxt.com/) |
| Tailwind CSS | [tailwindcss.com](https://tailwindcss.com/) |
| Vite | [vitejs.dev](https://vitejs.dev/) |
| Vue Router | [router.vuejs.org](https://router.vuejs.org/) |
| Lucide Icons | [lucide.dev](https://lucide.dev/) |

## 许可证

本项目基于 [MIT](LICENSE) 许可证开源。

Hermes Agent 原项目同样采用 MIT 许可证。
