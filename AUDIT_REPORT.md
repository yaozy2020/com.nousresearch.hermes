# Hermes for fnOS — 审计报告

> ⚠️ 本文件由 `scripts/gen-audit.py` 自动生成，请勿手工编辑。
> 数据源：manifest / tests / cmd / server modules / git tags。

## 当前版本：v0.31.2

- **生成时间**：2026-06-20 21:00:02 +0800
- **测试用例**：136 个 / 16 个文件
- **生命周期脚本**：9 个（config_callback, config_init, install_callback, install_init, main, uninstall_callback, uninstall_init, upgrade_callback, upgrade_init）
- **后端模块**：17 个
- **CI Workflow**：ci.yml, release.yml

## 代码审计摘要

| 维度 | 结果 | 说明 |
|:-----|:-----|:-----|
| 安全加固 | ✅ 已收敛 | 终端沙箱、CSRF 收紧、敏感文件 0o640/0o750、卸载路径白名单 |
| 权限控制 | ✅ 已收敛 | socket 0o660、进程管理 PID 校验、日志 600 |
| 输入校验 | ✅ 已收敛 | API 请求体类型检查、终端命令白名单、长度限制 |
| 配置隔离 | ✅ 已收敛 | manifest 是版本号唯一真相源，sync-version.py 自动同步派生位置 |
| 依赖管理 | ✅ 已收敛 | Python 3.12 + Bun ≥ 1.3.9 + Node.js v24，版本声明在 manifest |
| 前端安全 | ✅ 已收敛 | 静态资源路径白名单、`X-Frame-Options`、`safe-area-inset-bottom` |
| 中文编码 | ✅ 已收敛 | native2ascii + i18n 双保险，fnOS bun utf-8 解码 bug 已绕过 |
| 版本治理 | ✅ 已收敛 | preflight.sh 门禁，CI/CD 自动校验版本号一致性 |

## 后端模块清单

| 模块 | 行数 |
|:-----|:----:|
| `auth.js` | 159 |
| `backup.js` | 102 |
| `config.js` | 251 |
| `error.js` | 29 |
| `hermes.js` | 32 |
| `i18n.js` | 43 |
| `logger.js` | 151 |
| `openapi.js` | 110 |
| `providers.js` | 92 |
| `rate-limit.js` | 179 |
| `security.js` | 152 |
| `static.js` | 86 |
| `terminal-shell.js` | 101 |
| `terminal.js` | 256 |
| `trust.js` | 60 |
| `utils.js` | 40 |
| `version.js` | 163 |

## 生命周期脚本清单

| 脚本 | 触发 |
|:-----|:-----|
| `cmd/config_callback` | fnOS 不自动调用（平台限制），保留以备未来兼容 |
| `cmd/config_init` | fnOS 不自动调用（平台限制） |
| `cmd/install_callback` | fnOS 安装完成后自动调用 |
| `cmd/install_init` | fnOS 不自动调用，由 upgrade_callback 显式调用 |
| `cmd/main` | 应用启动 / restart / status 入口 |
| `cmd/uninstall_callback` | fnOS 卸载时调用 |
| `cmd/uninstall_init` | fnOS 卸载前调用 |
| `cmd/upgrade_callback` | fnOS 升级完成后自动调用 |
| `cmd/upgrade_init` | fnOS 不自动调用，由 upgrade_callback 显式调用 |

## 最近发布记录

| 版本 | 发布日期 |
|:-----|:----:|
| `v0.31.2` | 2026-06-20 |
| `v0.31.1` | 2026-06-20 |
| `v0.31.0` | 2026-06-20 |
| `v0.30.8` | 2026-06-20 |
| `v0.30.7` | 2026-06-20 |

## 待持续推进项

（无待持续推进项）

---

生成命令：`python3 scripts/gen-audit.py`
