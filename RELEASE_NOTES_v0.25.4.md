# Hermes for fnOS v0.25.4

安全加固正式版，建议所有用户升级。

## 下载

- `com.nousresearch.hermes_v0.25.4.fpk`
- MD5: `cc9ae92f47001efd08d6a3668493878d`

## 安全加固

- **Web 终端沙箱化**：ttyd 仅允许执行白名单 `hermes` 子命令，禁止 shell 元字符与任意命令注入
- **敏感配置脱敏**：`.env` 中 API Key / Token / Secret 等敏感值返回前端时显示为 `__MASKED__`，未修改时保留原值
- **Dashboard 安全模式**：默认绑定 `127.0.0.1`，不直接暴露无认证 Dashboard；需要外部访问请在 `.env` 中显式设置 `HERMES_DASHBOARD_INSECURE=1` 并重启应用
- **API 来源校验**：所有写操作与终端路径增加 `Origin` / `Referer` 校验，防止跨站请求伪造
- **静态文件路径安全**：`serveStatic` 改用 `resolve` + 前缀白名单，彻底防御目录穿越
- **卸载安全加固**：删除数据前校验路径必须位于 `/var/apps/` 或 `/vol2/@apphome/`，防止误删系统目录
- **进程管理加锁**：`isGatewayRunning` / `isDashboardRunning` 增加 `/proc/<pid>/cmdline` 进程名校验
- **日志轮转**：`gateway.log` 按天分割为 `gateway-YYYY-MM-DD.log`，自动保留最近 7 天

## 功能改进

- **配置页增加 Dashboard 不安全模式步骤提示**：在 `.env` 编辑框下方直接展示开启外部访问的操作步骤
- **状态总览 Terminal 卡片增加停止按钮**：可直接在首页停止 ttyd 终端进程

## 修复

- 修复生产构建相对 base 路径导致无尾斜杠访问时 JS/CSS 404 的问题
- 修复静态根路径把目录当文件返回导致 500 的问题
- 修复终端 Ctrl+C 不能正常中断 hermes 子进程的问题

## 安装/升级

1. 从 Releases 下载 `com.nousresearch.hermes_v0.25.4.fpk`
2. 在飞牛应用商店选择「手动安装」或「升级」
3. 升级会保留 `/vol2/@apphome/com.nousresearch.hermes/data/` 下的 venv 与配置

## 开启 Dashboard 外部访问

如需浏览器直接访问 `http://nas:9119`：

1. 面板 → 配置 → 在 `.env` 末尾添加 `HERMES_DASHBOARD_INSECURE=1`
2. 点「保存」
3. 到 fnOS 应用中心停止并重新启动 Hermes 应用
4. 回到面板，Dashboard 状态卡片会显示「外部访问模式」

> ⚠️ 开启后 Dashboard 将无认证暴露在局域网，公网映射或多人共用网络请勿启用。
