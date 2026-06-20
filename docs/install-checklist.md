# Hermes for fnOS — 安装后验收清单

> 适用版本：v0.21.2+
> 用途：安装/升级后按项检查，确保 UI 重构与后端模块化未引入回归

---

## 一、安装/升级流程

- [ ] 通过 fnOS 应用中心手动安装/上传 FPK：`/vol3/1000/下载盘/com.nousresearch.hermes.fpk`
- [ ] 安装完成后应用状态显示「运行中」，无红色报错
- [ ] 应用图标显示为新版浅色圆角剪影图标（非旧版默认图标）
- [ ] 点击图标能正常打开面板首页

## 二、首页 / 状态总览

- [ ] 页面加载无白屏、无 404、无 JS 报错（F12 Console）
- [ ] 顶部显示 Hermes 安装状态、Gateway 状态、Dashboard 状态
- [ ] 版本号显示正确（面板版本 + Hermes 安装状态）
- [ ] 点击「刷新」按钮后状态更新，Toast 提示「状态已刷新」
- [ ] Gateway 停止/启动/重启按钮可正常操作，状态指示灯跟随变化
- [ ] Dashboard 停止/启动/重启按钮可正常操作
- [ ] 底部最近日志区域有内容或显示「暂无日志」
- [ ] 自动刷新（5 秒间隔）工作正常

## 三、侧边栏与导航

- [ ] 侧边栏显示 Hermes 图标与导航项：状态、快速向导、终端、配置、频道、日志、关于
- [ ] 当前页面导航项高亮
- [ ] 点击导航项能正确切换页面
- [ ] 浏览器窗口宽度 ≤768px 时，侧边栏变为汉堡菜单抽屉
- [ ] 移动端抽屉可打开/关闭，点击菜单项后自动关闭

## 四、快速向导

- [ ] 向导页加载正常，步骤 1~5 可切换
- [ ] 「检查 Hermes 安装」步骤显示正确结果
- [ ] 已安装时「进入面板」按钮可用
- [ ] 未安装时安装流程可正常触发（如需要）
- [ ] 移动端下向导布局不溢出、按钮可操作

## 五、终端

- [ ] 终端页加载正常
- [ ] 选择命令（setup / model / login / gateway / doctor / status）后可启动 ttyd
- [ ] Web Terminal 区域能正常显示 shell 交互
- [ ] 停止终端按钮有效
- [ ] 无 ttyd 时给出友好提示

## 六、配置页

- [ ] 配置页加载正常
- [ ] `config.yaml` 内容正确回显
- [ ] `.env` 内容正确回显
- [ ] 修改配置后点击保存，提示成功
- [ ] 刷新页面后修改内容仍然保留
- [ ] YAML/Env 编辑器在移动端可用

## 七、频道页

- [ ] 频道页加载正常，列出 Telegram / Slack / Discord / QQ / 企业微信
- [ ] 已配置频道显示「已配置」标识
- [ ] 点击频道卡片可展开编辑表单
- [ ] 填写字段后保存成功
- [ ] 删除频道字段后保存成功
- [ ] 刷新页面后频道状态正确

## 八、日志页

- [ ] 日志页加载正常
- [ ] 默认显示最近 200 行日志
- [ ] 调整行数（如 50 / 100 / 500）后刷新生效
- [ ] 自动刷新工作正常
- [ ] 日志流 WebSocket（`/api/logs/stream`）连接正常

## 九、关于页

- [ ] 关于页加载正常
- [ ] 面板版本、Hermes 状态、仓库链接正确显示
- [ ] 链接可点击跳转
- [ ] 移动端下信息卡片垂直堆叠，不溢出

## 十、主题与样式

- [ ] 顶部主题切换器可切换：天空蓝 / 落日橙 / 星云紫 / 极光青 / 玫瑰红 / 强制深色
- [ ] 切换主题后按钮、链接、高亮文字颜色跟随变化
- [ ] 强制深色模式下所有页面保持暗色
- [ ] 切换主题后刷新页面，主题偏好保持（如已实现持久化）

## 十一、API 健康检查

- [ ] 通过浏览器或 curl 访问 `/api/health`，返回 JSON 包含：
  - `ok: true`
  - `time`
  - `hermesInstalled`
  - `gatewayRunning`
  - `gatewayPid`
  - `dashboardRunning`
  - `dashboardPid`
  - `dashboardPort`
  - `version`

示例（fnOS 网关路径下）：
```bash
curl -s https://<nas>/app/com-nousresearch-hermes/api/health | python3 -m json.tool
```

## 十二、后端模块化验证

- [ ] `/api/status`、`/api/dashboard/status`、`/api/hermes/status` 仍正常返回
- [ ] `/api/config` GET/POST 正常
- [ ] `/api/channels` 与 `/api/channels/{name}` 正常
- [ ] `/api/gateway/start|stop|restart` 正常
- [ ] `/api/dashboard/start|stop|restart` 正常
- [ ] `/api/hermes/restart` 与 `/api/hermes/stop_all` 正常
- [ ] `/api/terminal/start|stop|status` 正常
- [ ] `/api/logs` 正常
- [ ] `/api/version` 正常

## 十三、回归检查

- [ ] 原有 `/api/*` 接口无 404、无 500
- [ ] 原有 Gateway/Dashboard 进程管理功能不受影响
- [ ] 升级后旧配置（config.yaml / .env）仍然保留
- [ ] 卸载后重新安装无残留冲突

## 十四、移动端验收

- [ ] iPhone / Android 浏览器打开面板，布局自适应
- [ ] 底部 Tab 栏可切换页面
- [ ] 所有按钮在移动端可点击
- [ ] 输入框在移动端可正常聚焦输入

---

## 问题记录模板

| 检查项 | 结果 | 现象 | 截图/日志 |
|:-------|:----:|:-----|:---------|
|        |      |      |          |

---

## 备注

- 若某项失败，优先检查 `/usr/trim/nginx/logs/access.log` 和 Hermes 面板日志
- 通过 unix socket 直连后端排查：`curl --unix-socket /vol2/@appcenter/com.nousresearch.hermes/com.nousresearch.hermes.sock http://x/api/health`
- 后端源码入口：`/var/apps/com.nousresearch.hermes/target/server/index.js`
