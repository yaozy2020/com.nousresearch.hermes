# Hermes for fnOS v0.30.5 — 应用设置 WebUI 端口配置 + 治理收尾

> 发布日期：2026-06-20  
> 上一版本：v0.30.4  
> 类型：功能 + 工程治理

---

## 🆕 新功能

### 1. 应用设置页支持修改 Dashboard 端口

**问题**：v0.30.4 之前，`HERMES_DASHBOARD_PORT` 仅在「安装向导」首次配置时可设，安装完后想改端口必须 SSH 编辑 `.env`，体验割裂。

**改进**：
- 新增 API：`GET/POST /api/settings/dashboard-port`
- 「高级配置」页面顶部新增独立卡片，带端口校验（1024-65535）
- 修改后写入 `.env`，提示用户在 fnOS 应用中心**重启 Hermes 让新端口生效**（fnOS service 进程的 env 在启动时注入，单独写 .env 不影响当前进程）

**位置**：应用面板 → 高级配置 → Dashboard 端口

### 2. Dashboard 风险提示加强（P1 收尾）

- 状态卡片在「外部访问模式」下显示 ⚠️ 红色 "未加密" 角标（color=error）
- 副标题改为「⚠ 局域网无认证暴露」，提高用户警觉
- 点击「打开」按钮时多弹一条 warning toast 提醒"无登录鉴权，请仅在可信局域网使用"

---

## 🔧 工程治理

### 3. build.sh 自动同步 package.json 版本

**问题**：`manifest` v0.30.4 时 `package.json` 仍是 `0.27.0`，版本漂移。

**改进**：build.sh 在 [0/6] 步骤里读 manifest 版本，写回 package.json，避免手动维护两份。

### 4. build.sh 自动注入 fpk SHA256

**问题**：v0.30.4 manifest 的 `checksum` 字段为空。

**改进**：
- 打包完成后用 `sha256sum` 算 fpk 哈希
- `sed` 写回 manifest `checksum` 字段
- 同时输出 `<fpk>.sha256` 校验文件方便 release 上传
- 完整闭环防篡改：用户安装时 fnOS 可对照 manifest checksum 验证

---

## 📋 文件变更

| 文件 | 改动 |
|:--|:--|
| `manifest` | version 0.30.4 → 0.30.5；新 changelog；checksum 留空（build.sh 注入） |
| `package.json` | version 0.27.0 → 0.30.5（后续由 build.sh 自动同步） |
| `build.sh` | 新增 [0/6] 版本同步逻辑、末尾 SHA256 注入 |
| `app_src/server/index.js` | 新增 `/api/settings/dashboard-port` 路由 |
| `app_src/server/modules/config.js` | 新增 `setEnvKey(key, value)` 安全写入函数 |
| `app_src/ui-vue/src/pages/config/index.vue` | 新增 Dashboard 端口卡片 |
| `app_src/ui-vue/src/pages/index.vue` | Dashboard 状态卡片加 ⚠ 角标 + open 时风险 toast |
| `README.md` | badge 0.30.3 → 0.30.5 |
| `tests/config-set-env-key.test.js` | 新增 setEnvKey 单元测试 |

---

## ✅ 测试

- 全部既有 78 个测试用例继续通过
- 新增 4 个 setEnvKey 单元测试（合法/非法 key、新增/覆盖、保留 chmod 0o640）

---

## 🚀 升级方式

1. `git pull && bash build.sh`
2. 在 fnOS 应用中心「升级」Hermes
3. 升级完成后打开「高级配置」页面，可见 Dashboard 端口卡片
