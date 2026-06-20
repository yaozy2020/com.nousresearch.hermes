# Hermes for fnOS

[![Version](https://img.shields.io/badge/version-0.30.2-blue)](https://github.com/yaozy2020/com.nousresearch.hermes/releases/tag/v0.30.2)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![fnOS](https://img.shields.io/badge/fnOS-%E2%89%A5%201.1.3107-orange)](https://www.fnnas.com/)

将 [Hermes Agent](https://github.com/NousResearch/hermes-agent) 部署到飞牛 NAS 的原生应用包。

## 简介

[Hermes](https://github.com/NousResearch/hermes-agent) 是 Nous Research 做的 AI Agent 平台，主打自学习和多模型支持。官方提供 Gateway（消息通道）和 Dashboard（Web 管理界面），但官方面板面向通用 Linux，对飞牛 NAS 的适配不够直接。

这个项目把 Hermes 的 Gateway 和 Dashboard 打包成 fnOS 原生应用。打开飞牛应用商店，像装其他应用一样装好，然后用面板里的向导走一遍就能跑起来。面板本身负责进程启停、配置预设和状态监控，复杂的 Provider / Channel / Skill 配置还是建议进官方 Dashboard 调。

## 核心功能

面板本身做得很轻量：Bun 后端跑在 Unix socket 上，不依赖 Docker；前端是 Vue 3 + Nuxt UI v4 + TailwindCSS v4，视觉风格和 QwenPaw 控制台保持一致。

上手走 4 步向导：检查 Hermes 装好没 → 选一个 Provider 预设 → 启动 Gateway → 启动 Dashboard。预设里内置了 OpenRouter、DeepSeek、GLM、Kimi、OpenAI 等 11 个，你也可以通过 `/api/providers/user` 自己加。

消息频道这块，面板直接提供 Telegram、Slack、Discord、QQBot、企业微信的表单，填完写 `.env`，重启 Gateway 就生效。更复杂的频道（比如 Signal、WhatsApp）还是得进官方 Dashboard 配置。

状态页会实时显示 Hermes、Gateway、Dashboard 和终端进程的运行状态，每 5 秒刷一次。点一下「健康自检」会跑 8 项检查（Bun 环境、hermes-agent、进程、Provider Key 等），有问题直接弹 toast 提醒。

内置的 ttyd 终端在手机上也能用，工具栏做了双排：上面一排是 Ctrl+C、Tab、方向键这些常用键，下面一排是字体大小、复制屏幕、提取链接和粘贴。底部还做了安全区适配，不会被手机 Home 条挡住。

面板自带备份还原功能，可以打包 `.env`、`config.yaml` 和 `channels` 目录，还原前会自动先备份一次，不会把手头配置弄丢。

如果开发者需要，`/api/diagnostics/openapi` 能出 OpenAPI 3.1 的 spec，`/api/docs` 提供内嵌的接口列表，不需要外网加载 CDN。

其他细节包括：`/api/trust` 做 SHA256 信任清单校验；`server/modules/i18n.js` 加了个 i18n 框架，改 `HERMES_LOCALE` 就能切语言；主题会自动跟随飞牛系统的亮暗模式，支持 6 种主题色；桌面端侧边栏 + 移动端底部 Tab，响应式适配。

## 快速开始

### 前置要求

- 飞牛 NAS 系统 ≥ 1.1.3107
- 应用商店里装好 Bun 和 Node.js v24

### 安装

1. 去 [Releases](https://github.com/yaozy2020/com.nousresearch.hermes/releases) 下载最新的 `.fpk`
2. 飞牛应用商店 → 手动安装 → 上传这个 `.fpk`
3. 装完在桌面点 Hermes 图标打开面板
4. 跟着快速向导走 4 步：检查 Hermes → 选 Provider → 启动 Gateway → 启动 Dashboard

Bun、Node.js、Python 3.12 这些依赖装包的时候会自动处理，不用手动装。

## 项目结构

```
com.nousresearch.hermes/
├── app_src/
│   ├── server/                # Bun 后端，跑在 Unix socket 上
│   │   ├── index.js           # 入口
│   │   └── modules/           # 按职责拆分：config、hermes、logger、static、terminal、utils、version
│   ├── ui/                    # 构建好的前端，build.sh 从 ui-vue 同步过来
│   │   ├── index.html
│   │   ├── config             # fnOS UI 配置入口
│   │   └── public/            # JS/CSS/字体
│   └── ui-vue/                # Vue 3 + Nuxt UI v4 + TailwindCSS v4 源码
│       ├── src/
│       │   ├── assets/        # 全局样式
│       │   ├── components/    # 侧边栏 / 底部 Tab / 响应式布局
│       │   ├── composables/   # useApi / useTheme
│       │   ├── config/        # 导航配置
│       │   ├── pages/         # 状态总览 / 向导 / 终端 / 配置 / 频道 / 日志 / 关于
│       │   └── types/         # 前后端共享的类型定义
│       ├── public/icons/      # Hermes 图标
│       ├── package.json
│       └── vite.config.ts
├── shared/
│   └── api-types.ts           # 前后端共享 API 类型
├── cmd/                       # 生命周期回调
│   ├── main                   # 启动/停止/状态
│   ├── install_callback       # 安装后
│   ├── upgrade_callback       # 升级后
│   ├── uninstall_init         # 卸载前
│   ├── uninstall_callback     # 卸载时
│   └── config_callback        # 配置变更
├── config/
│   ├── resource               # 数据共享目录权限
│   ├── privilege              # 应用权限声明
│   └── prompts/SOUL.md        # Hermes 系统提示词
├── wizard/
│   └── uninstall              # 卸载向导
├── manifest                   # 应用清单
├── build.sh                   # fpk 打包脚本
├── ICON.PNG / ICON_256.PNG
└── README.md
```

## 构建

```bash
bash build.sh
```

输出是 `com.nousresearch.hermes_v<VERSION>.fpk`，大概 1.2 MB。`build.sh` 会先装前端依赖、构建 Vue 工程、同步到 `app_src/ui`，最后打包。同步的时候会保留 `config` 等运行时文件，不会把用户的配置冲掉。

## 版本历史

### v0.30.2（当前版本）

这一版把之前分散在几个小版本里的功能攒到一起发了。

**后端新增了几个接口**：`/api/providers/user` 可以自己加 Provider 预设，叠在内置 11 个上面；`/api/backup` 做配置备份还原，时间戳到毫秒避免重名覆盖；`/api/trust` 管 SHA256 哈希清单；`/api/diagnostics/openapi` 和 `/api/docs` 给开发者看接口文档。

**前端主要改了终端体验**：ttyd 在手机上的工具栏改成双排，上面一排是 Ctrl+C、Tab、方向键，下面一排是字体大小、复制屏幕、提取链接和粘贴。复制屏幕会直接把终端里的文字拷到剪贴板，链接提取会自动找出屏幕上出现的网址，单条直接复制，多条弹出来选。字体可以 12 到 20 像素循环调，底部做了安全区适配。

**其他改动**：面板加了 i18n 框架，改个环境变量就能切语言；健康自检出问题时会弹 toast 提醒；测试补到 78 项全过；打包脚本把 server 目录里的中文转成 `\uXXXX`，绕过 fnOS 上 Bun 1.3.9 的 utf-8 解码问题。

### v0.27.0

这版主要做基建：健康自检、API 路径兼容、CI 工作流、中文乱码修复。

新增了 `/api/diagnostics`，点一下就能检查 8 项：Bun 环境、hermes-agent 装好没、Gateway 和 Dashboard 进程在不在、Provider Key 配了没、监听模式、ttyd 二进制存不存在。结果用三色展开，一眼就能看出哪有问题。

前端改了个坑：fnOS 网关前缀不是固定的，之前写死路径会 fetch 失败。现在启动时把前缀写进 `<meta>`，前端优先读 meta，读不到再用正则猜，换了路径也不会挂。

CI 方面加了 `.github/workflows/ci.yml`，PR 和 push 会自动跑 lint、测试和 Vue 构建。release 工作流在打 tag 时自动构建 fpk，fnpack 工具坏了也能降级成告警，不影响手动发版。

最麻烦的是中文乱码：fnOS 用 bun 1.3.9 跑服务时，同一个二进制同一个环境变量，不同用户身份解码 utf-8 的行为不一样。最终方案是在打包时把 server 目录里所有 js 文件的中文字符转成 `\uXXXX`，从根源上避开这个问题。

### v0.26.6 ~ v0.26.8

这三个版本主要收敛安全问题，顺带修了一些体验细节。

终端那边，`/api/terminal/send` 加了 4KB 长度限制。注释里也写清楚了：白名单只在 ttyd 启动时校验参数，启动后交互式输入由子命令自己负责。

卸载脚本的日志收敛了：默认关掉 `set -x`，只有设了 `HERMES_DEBUG=1` 才会开详细日志。日志文件权限从 666 改成 600，防止环境变量泄露到 `/tmp`。

Hermes 安装失败时会回退到 GitHub 源，现在会主动广播提示。限网环境可以设 `HERMES_NO_FALLBACK=1` 关掉回退。

日志清理改成每 6 小时跑一次，不会每次写日志都扫一遍目录。

### 常见问题（FAQ）

**Q: 卸载后还能看到 `/var/apps/com.nousresearch.hermes/` 空目录？**

这是 fnOS 框架的安全设计 —— 应用以独立用户身份运行，无权删除自己的父目录。空目录会在系统下次重启或重装时由系统清理，不影响重装。

**Q: 在限网环境（无外网/仅内网镜像）使用，怎么避免 pip 自动回退到 GitHub？**

在「高级配置」的 `.env` 中加入 `HERMES_NO_FALLBACK=1`，再点击「重启 Hermes」即可。pip 失败时不会再尝试 GitHub。

### v0.26.5

修复卸载后再装，面板还显示旧版本的问题。

根因是卸载脚本的路径白名单写死了，fnOS 真实的 `TRIM_PKGHOME` 路径对不上，被误判为不安全路径。改完后卸载默认删运行环境、保留配置，这样 venv 和日志不会残留，重装后状态干净。调试日志改成每次用 `mktemp` 新建文件，避免固定日志文件被占用导致写不进去。

### v0.26.4

重新设计了卸载向导。以前是「保留」和「清除」两个单选，容易误操作。现在改成两个开关：「保留用户数据」和「确认删除用户数据」，默认都勾选保留，重装后配置能自动恢复。卸载脚本的日志也加了更清晰的输出，方便排查问题。

### v0.26.3

修复桌面端图标不显示的问题。补齐了 `icon_64.png` 和 `icon_256.png`，并把 `app/ui/config` 里的图标路径改成 `images/icon_{0}.png`，和 QwenPaw 的写法一致。

### v0.26.2

卸载向导默认值改回「保留」。保留配置和保留运行环境两个开关默认都勾选，防止用户手滑删数据。需要彻底删除的话，手动把开关关了就行。

### v0.26.1

这版把卸载向导的默认值改成了「不保留」。保留配置和保留运行环境默认都不勾选，防止卸载后还残留 venv 和配置。后来发现这样容易误删数据，下个版本又改回来了。

### v0.26.0

治理系列的最终合并版，把 v0.25.4 到 v0.25.8 的安全加固和工程改进全揉进来了。包括：终端做了沙箱限制只能跑白名单命令；CSRF 校验收紧；安装包来源限制；敏感文件权限改成 0o640/0o750；日志按天轮转；前后端 API 加了类型检查；非法 JSON 返回 400；静态目录请求返回 404；Dashboard 可以一键锁本地；频道页加了实时校验。

### v0.25.8

收尾版，修了一堆小问题。

进程管理改成了直接启动 `bun`，避免 bash 子进程残留，PID 和真实进程对得上。请求体校验加上了，非法 JSON 直接返回 400，不会静默吞错。静态文件目录请求现在返回 404，不会泄露目录存在。频道配置页改用 `v-model` 绑定，必填字段实时校验，没填会标红。Dashboard 首页加了模式提示，显示是「外部访问模式」还是「本地安全模式」，还能一键锁回本地。

### v0.25.7

安全和治理加强版。

CSRF 校验收紧了：以前只要是私有 IP 就放行，现在写操作必须 `Origin` 和 `Host` 匹配，`Origin: null` 直接拒绝。Hermes 安装包默认只允许官方源和 `hermes-agent`，要装自定义源得显式设 `HERMES_ALLOW_CUSTOM_PACKAGE=1`，而且 shell 元字符、`file://`、pip 选项这些危险输入还是禁的。

终端加了防点击劫持：`/ttyd*` 响应带了 `X-Frame-Options: DENY` 和 `CSP: frame-ancestors 'self'`，GET 请求还会校验来源。

卸载向导参考 QwenPaw 改成了三个开关：保留配置、保留运行环境、确认卸载，避免误删 venv 或配置。

### v0.25.4

状态总览的 Terminal 卡片加了停止按钮，不用进终端页面就能停 ttyd 进程。配置页在 `.env` 编辑框下面直接写了开启外部访问的步骤，不用再去查文档。

### v0.25.3

同步了 README 和面板里的提示文案，把 Dashboard 不安全模式的开启步骤写得更清楚。

### v0.25.2

这版主要做安全和稳定性。

Web 终端加了沙箱：`terminal-shell.js` 限制 ttyd 只能跑白名单里的 `hermes` 子命令，禁止 shell 元字符和任意命令注入。之前 Ctrl+C 中断不了命令的问题也修了。

敏感配置脱敏：`.env` 里的 API Key、Token、Secret 返回前端时显示成 `__MASKED__`，没改过就保留原值。频道表单已经用了密码输入框。

Dashboard 默认绑定 `127.0.0.1`，不会直接暴露到网络。要外网访问得在 `.env` 里显式设 `HERMES_DASHBOARD_INSECURE=1` 并重启。

启动 Dashboard 前会检测端口占用，被占了会报错。所有写操作和终端路径都加了 `Origin` / `Referer` 校验，防 CSRF。静态文件路径改用 `resolve` + 前缀白名单，防目录穿越。删除数据前会校验路径必须在 `/var/apps/` 或 `/vol2/@apphome/` 下，防止误删系统文件。进程管理加了 `/proc/<pid>/cmdline` 校验，避免旧 PID 指向别的进程。日志按天轮转，自动保留最近 7 天。

### v0.24.1

打磨移动端体验、安装向导和信息展示。

CLI 终端在手机上的快捷键改了后端代理：前端不再往 iframe 里注入代码，改走 `/api/terminal/send` 转发输入，`Ctrl+C` 走 `/api/terminal/signal` 给 ttyd 发 `SIGINT`，能真正中断命令。之前 HTML 里 `\uXXXX` 被当普通字符显示的问题也修了。

状态卡片统一了风格：左侧圆角图标区 + 状态点 + 标题和副标题，卡片等高对齐。装了 Hermes 后会同时显示 Hermes 版本和 Dashboard 版本。

桌面图标修了：`ICON.PNG` 和 `ICON_256.PNG` 转成 16-bit RGBA，fnOS 桌面不会再显示占位图。

安装向导支持自定义 Dashboard 端口，默认 9119，留空就用默认。新增 pip 源选择，默认清华源，选好后写进 `.env`，面板里一键安装 `hermes-agent` 时会生效。

关于页补全了 Dashboard 版本、Venv 和数据目录。主题色提示改成只有主动切换时才弹，不会每次进关于页都弹。移动端底部「更多」改成了下拉菜单，包含消息频道、日志和关于，不会只能跳转到关于页。版本信息修了，不会再显示 `-`。

### v0.23.9

0.23.x 的统一版本，主要改终端和安装体验。

ttyd 不再直接暴露 9123 端口，改由主应用反向代理 `/ttyd/*`（HTTP + WebSocket 都过一遍）。新增了 `/ttyd-mobile` 给手机用，优化了 viewport、安全区和工具条。工具条支持 Ctrl+C、Tab、Esc、方向键和粘贴，解决手机浏览器没功能键的问题。

修了一堆 ttyd 的坑：去掉了 `--once` 限制，重写了 `Location` 避免跳回 127.0.0.1，修了 WebSocket subprotocol，自动找可用端口，统一带斜杠访问 `/ttyd/`。

版本信息修了：构建时把 Panel 版本写进 `build-meta.json`，Hermes 版本通过 `hermes --version` 异步读，正则提取纯版本号，不会显示乱码。

状态总览加了「安装中」状态，显示 Gateway、Dashboard、Terminal 的运行时间，新增了 Terminal 状态卡片。高级配置之前写错路径不生效，现在对齐到 Hermes 实际读的 `HERMES_HOME`（`~/.hermes`），保存后重启 Gateway 就生效，启动时还会自动迁移旧配置。安装向导步骤 3/4 加了「上一步」按钮。状态卡片视觉统一，4 张等高，路径太长会截断，未运行显示 power-off 图标，运行中加心跳动画。

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

前端 UI 全面重构。换成 Vue 3 + Nuxt UI v4 + TailwindCSS v4，视觉风格和 QwenPaw 控制台保持一致，和 fnOS 系统更搭。

后端 `server/index.js` 按职责拆成了 `config`、`hermes`、`logger`、`static`、`terminal`、`utils`、`version` 几个模块。新增了 `shared/api-types.ts`，前后端共享类型定义。

构建工具链统一用 Bun：`app_src/ui-vue/` 用 Bun 装依赖、构建，产物通过 `build.sh` 同步到 `app_src/ui`，不会把 `config` 这些运行时文件冲掉。

状态总览的 `/api/health` 聚合了 Hermes 安装状态、venv、二进制路径、Gateway/Dashboard 运行状态和 PID/端口，前端从 4 个并发请求减到 2 个。

侧边栏顶部的图标换成了官方 Hermes Agent 文字 SVG，颜色会跟着主题走。`ICON.PNG` 和 `ICON_256.PNG` 换成了不透明白底 H 艺术字，符合 fnOS 应用中心的要求。

构建产物瘦身了，fpk 从约 1.4MB 降到约 950KB。

### v0.21.2

卸载流程加强。

`uninstall_init` 会主动扫描 `/root`、`/home/*` 和 `PKGHOME` 下的 `~/.config/systemd/user/hermes-*.service`，用三种方式（machinectl、sudo+XDG、直调）尝试 disable 后再删文件、清软链。解决之前用户 SSH 跑过 `hermes gateway setup` 后装了个 systemd 服务，导致卸载不干净的问题。

进程清理也加强了：匹配模式从 3 个扩到 7 个，新增 ttyd、hermes_cli、hermes-gateway、hermes-dashboard。TERM 后最多等 8 秒优雅退出，不行就 KILL。

新增了 `scripts/hermes_uninstall_verify.sh` 真机验证脚本，snapshot → 检查保留 → 检查删除，30 分钟跑完一次往返测试。

注：`/vol2/@apphome/<app>/` 的 4KB 空壳目录是 fnOS 框架管的，独立用户没权限删 root 拥有的父目录，不算残留。

### v0.21.1

安装和升级向导补了说明。

应用商店的安装向导加了使用声明，推荐先用 CLI 终端初始化。升级向导写了清楚，升级不会动 venv、`~/.hermes`、Provider 配置和 API Key。控制面板的快速向导顶部也加了提示 banner，引导用户优先用内置的 ttyd 终端跑 `hermes setup`、`hermes model`、`hermes gateway setup` 这些命令，避免和本机 Python 环境冲突。

### v0.21.0

新增了「CLI 终端」Tab。内置 ttyd 1.7.7 静态二进制（1.3 MB），点按钮开新标签页，可以直接跑 `hermes setup`、`hermes model`、`hermes login`、`hermes gateway setup`、`hermes doctor`、`hermes status`。支持 OAuth 设备授权码、API Key 粘贴、密码隐藏输入。

状态总览右上角加了「🔄 重启 Hermes」一键按钮，顺序停 Gateway 和 Dashboard 后整体重启。后端新增了 `/api/terminal/{status,start,stop}` 和 `/api/hermes/{restart,stop_all}` 5 个接口。命令白名单严格限定 6 条 hermes 子命令，没有任意命令执行风险。`cmd/main stop` 时会自动清理 ttyd 残留进程。

### v0.20.3

修了版本号穿帮：`/api/version` 改成运行时从 manifest 动态读面板版本，不再硬编码。agent 字段改成实时探测：通过 `hermes --version` 检查 venv 里有没有装 hermes-agent，没装返回 `not_installed`，新增了 `agent_installed` 布尔字段。socket 权限收紧，`com.nousresearch.hermes.sock` 从 0o777 改成 0o660（只有 owner 和 group 能访问）。文案统一：「Hermes 官方 Web 界面」改叫「Hermes 官方控制台」。

### v0.20.2

消息频道页的文案统一了。所有「Hermes Web UI / 官方 Web UI」按钮和提示都改成「打开 Dashboard」，和首页用词保持一致。

### v0.20.1

修了卸载脚本：`uninstall_init` 会真正停掉 bun server、hermes gateway、dashboard 进程，并兜底清理 socket 和 pid 文件。`uninstall_callback` 正确读取向导选择，「清除所有应用数据」时会彻底删 venv、`.hermes`、home、config、logs、workspace、runtime、state 这些子目录，不会残留数据。

### v0.20.0

新增了「消息频道」Tab，支持 Telegram、Slack、Discord、QQBot、企业微信 5 个频道直接表单配置，写入 `.env` 后重启 Gateway 就生效。更复杂的频道（DingTalk、Feishu、Email、Webhook）和需要外部依赖的（Signal、WhatsApp、BlueBubbles、SMS、Matrix、Yuanbao 等）会写明依赖，引导用户去 Dashboard 配。

LLM Provider 列表精简了，删掉了 OpenAI 兼容、Ollama、Nous Portal（OpenAI 兼容改走 OpenCode Zen/Go，另外两个去 Dashboard 配）。新增了 Google Gemini、智谱 GLM、Moonshot Kimi、MiniMax 预设。关于页加了 Hermes 官方文档和中文社区文档链接。

### v0.19.0

UI 设计系统对齐飞牛 Semi Design 色板（grey 系列灰阶 + rgba 透明度边框），视觉和系统原生保持一致。

修复了主题跟随机制：读 `localStorage['fnos-theme-mode']` 写到 `body[theme-mode=dark]`，飞牛系统切亮暗模式时自动同步。监听 `storage` 事件实时响应。第三颗主题球保留做强制深色 fallback，防止移动端 iframe 读不到 localStorage。圆角从 8px 改成 6px，匹配 Semi Design 风格。

### v0.18.3

向导第 2 步选中 Provider 后可以改 Base URL 和 API Key，自动写进 `.env`。新增了 OpenCode 和 OpenAI 兼容两个 Provider 预设。

### v0.18.2

移动端快速向导改成竖排布局，每步独占一行，不会再溢出了。

### v0.18.1

更正了本应用的 GitHub 地址。

### v0.17.0

UI 全面重构：侧边栏导航 + 4 步快速向导 + 3 列状态卡片 + 高级配置页。侧边栏顶部加了 LED 状态指示灯。新增了中文 i18n 帮助文案。移动端改成抽屉式侧边栏，3 级断点响应式。

## 常见问题

### Gateway 和 Dashboard 有什么区别？

**Gateway** 是消息通道服务，接收 Telegram、Discord、Slack 等渠道的消息并转发给 Agent，后台以用户进程运行。**Dashboard** 是 Web 管理界面（端口 9119），用来配 Provider、Channel、Skill 这些详细参数。

### 安装后 Hermes 装在哪？

装在独立用户目录的虚拟环境里：`/vol2/@apphome/com.nousresearch.hermes/data/venv/bin/hermes`

### 如何更新？

去飞牛应用商店找到 Hermes，点更新就行。会自动停旧进程、pip 装最新版 hermes-agent、再重启服务。

### 卸载会留下数据吗？

v0.25.7 起卸载向导有三个开关：保留配置文件、保留运行环境、确认卸载。前两个默认勾选，最后一个必须开才会真的删。旧版「保留 / 清除」两种模式也兼容。

### Dashboard 默认是安全模式吗？

v0.25.7 起改了，默认绑定 `0.0.0.0:9119`（`HERMES_DASHBOARD_INSECURE=1`），安装完直接能在局域网浏览器访问 `http://nas:9119`。

如果想锁回仅本机访问：

1. 打开 Hermes 面板 → **配置**
2. 把 `.env` 里的 `HERMES_DASHBOARD_INSECURE=1` 改成 `0`
3. 点「保存」
4. 去 **fnOS 应用中心**停掉 Hermes 再重新启动

默认模式没认证，建议只在家庭内网用。公网映射或者多人共用网络，记得锁回 `HERMES_DASHBOARD_INSECURE=0`。

### 亮暗模式不跟随飞牛系统？

v0.22.0 起面板会自动读飞牛桌面写的 `DesktopConfig-1000` localStorage 来同步亮暗模式。如果切了飞牛主题面板没变，刷新一下浏览器页面就行。

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
