# Hermes for fnOS — 审计报告

## 当前版本：v0.30.2

### 代码审计摘要

| 维度 | 结果 | 说明 |
|:-----|:-----|:-----|
| 安全加固 | ✅ 已收敛 | 终端沙箱、CSRF 收紧、敏感文件 0o640/0o750、卸载路径白名单 |
| 权限控制 | ✅ 已收敛 | socket 0o660、进程管理 PID 校验、日志 600 |
| 输入校验 | ✅ 已收敛 | API 请求体类型检查、终端命令白名单、长度限制 |
| 配置隔离 | ⚠️ 待改进 | `config_callback` 重启逻辑已补，但 `install_init/upgrade_init` 仍为空壳 |
| 依赖管理 | ✅ 已收敛 | Python 3.12 + Bun ≥ 1.3.9 + Node.js v24，版本声明在 manifest |
| 前端安全 | ✅ 已收敛 | 静态资源路径白名单、`X-Frame-Options`、`safe-area-inset-bottom` |
| 中文编码 | ✅ 已收敛 | native2ascii + i18n 双保险，fnOS bun utf-8 解码 bug 已绕过 |

### 近期关键变更

#### v0.30.2
- 新增 `modules/i18n.js` + `zh-CN.json`，diagnostics 文案走 `t(key)`
- 新增 `/api/providers/user`、`/api/backup/*`、`/api/trust/*`、`/api/diagnostics/openapi`
- ttyd 移动端工具栏重构为双排布局
- `tests/v030-modules.test.js` 11 项新单测，78/78 全过
- `build.sh` 扩展 native2ascii 范围

#### v0.27.0
- 新增 `/api/diagnostics` 健康自检（8 项检查）
- `index.html` 注入 `<meta name="hermes-api-base">`，API 路径鲁棒化
- `.github/workflows/ci.yml` + `release.yml` 入仓
- 修复 fnOS App WebView 中文乱码（native2ascii 打包转义）

#### v0.26.0
- 合并 v0.25.4 ~ v0.25.8 安全加固
- 终端沙箱化、CSRF 收紧、安装包来源限制
- 日志按天轮转、API 类型同步、统一错误处理

### 待改进项（对照 QwenPaw）

| 项 | 状态 | 说明 |
|:--|:-----|:-----|
| `cmd/config_callback` 重启 | ✅ 已修复 | 复用 `cmd/main restart`，配置变更立即生效 |
| `cmd/install_init` / `upgrade_init` | ⏳ 待完善 | 当前为 `exit 0` 空壳，建议至少加 `log_msg` 标记 |
| Manifest `checkport` | ✅ 已修复 | 已添加 `checkport = false`（主服务为 Unix socket，不适配 TCP 端口检测） |
| 审计报告 | ✅ 已建立 | 本文件，每次发版前更新 |
| Issue/PR 模板 | ⏳ 待完善 | 建议加 `.github/ISSUE_TEMPLATE/` 和 `PULL_REQUEST_TEMPLATE.md` |
| `.gitignore` 完善 | ⏳ 待检查 | 确认 `build/`、`.hermes-test-*`、`__pycache__` 已忽略 |

### 对比 QwenPaw (yaozy2020/QwenPaw)

| 维度 | QwenPaw | Hermes | 结论 |
|:-----|:--------|:-------|:-----|
| 前端框架 | React (v1.1.12) | Vue 3 + Nuxt UI v4 | Hermes 更现代，无 CGI 开销 |
| 部署方式 | CGI (`api.cgi` + `index.cgi`) | Bun Unix socket | Hermes 架构更优 |
| 回调脚本 | 完整 6 步生命周期 | 3 步有空壳 | Hermes 需补齐 `install_init/upgrade_init` |
| 多通道 | 微信/QQ/钉钉/飞书/Discord/Telegram | 5 个绿色频道 + 跳转 Dashboard | QwenPaw 更丰富，但 Hermes 走官方 Dashboard 可扩展 |
| 打包工具 | fnpack | fnpack + build.sh | 一致 |

---

*最后更新：2026-06-20*
