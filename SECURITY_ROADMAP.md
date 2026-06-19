# Hermes for fnOS — 安全加固与工程质量改进路线图

> 目标版本：v0.25.0  
> 分支：`security-hardening-v0.25.0`  
> 本路线图基于对 v0.24.1 的甲方/产品/技术三方审计结论制定。

---

## 0. 总体原则

- **安全 > 正确 > 稳定 > 性能 > 优雅**
- **最小可用改动**：尽量在现有架构内修补，不推翻重做
- **向后兼容**：已安装用户的配置、venv、数据目录不破坏
- **可验证**：每处改动配套本地测试命令

---

## 1. P0 安全加固（必须在本版本完成）

### 1.1 Web 终端沙箱化

**问题**：`ttyd` 直接暴露完整 shell，用户可执行任意命令。

**方案**：
1. 新增 `app_src/server/modules/terminal-shell.js`：实现受限命令包装器
2. 只允许执行白名单命令：`hermes setup / model / login / gateway setup / doctor / status`
3. 拦截 shell 元字符：`; | & $ \` ( ) { } < >`
4. `startTtyd` 不再直接启动 `hermes ...`，而是启动包装脚本
5. 包装脚本以 `-r` 受限模式运行，或直接用 `exec` 替换进程

**验收标准**：
```bash
# 在 ttyd 中尝试以下命令应被拒绝或无效：
ls /
rm -rf /
hermes setup; ls /
echo $(cat /etc/passwd)
```

### 1.2 敏感配置脱敏

**问题**：`.env` 中 API Key、Token 明文回显到前端。

**方案**：
1. 新增 `SENSITIVE_ENV_KEYS` 集合，覆盖所有 `*_API_KEY`、`*_TOKEN`、`*_SECRET`
2. `readConfig` 返回的 `env` 中，敏感值替换为 `__MASKED__`
3. `writeConfig` 时，若敏感字段仍为 `__MASKED__`，保留旧值
4. 前端输入框 `type="password"`，并支持显示/隐藏切换

**验收标准**：
- 浏览器 DevTools 中看不到明文 API Key
- 保存配置但不修改 Key 时，原 Key 不变

### 1.3 Dashboard 安全模式

**问题**：`hermes dashboard --insecure` 关闭安全校验。

**方案**：
1. 移除 `--insecure`
2. Dashboard 绑定 `127.0.0.1`，仅允许本机访问
3. 面板提供反向代理跳转：`/api/dashboard/open` 返回带一次性 token 的安全 URL，或直接在面板内 iframe/open 127.0.0.1 端口
4. 默认端口仍 9119，但若自定义端口冲突则拒绝启动

**验收标准**：
- `ss -tlnp | grep 9119` 显示监听地址为 `127.0.0.1:9119`
- 无法从外部 IP 直接访问 Dashboard

### 1.4 静态文件路径安全

**问题**：`serveStatic` 的 `normalize` + `replace` 防御不足。

**方案**：
1. 使用 `path.resolve(STATIC_DIR, pathname)`
2. 校验结果必须 `startsWith(STATIC_DIR + path.sep)`
3. 拒绝包含 NUL 字节的路径
4. 对 `/` 仍回退到 `index.html`

### 1.5 API 来源校验（CSRF/Origin 防护）

**问题**：写操作接口缺少来源校验。

**方案**：
1. 所有 POST/PUT/DELETE API 增加 `Origin` / `Referer` 校验
2. 允许的来源：同域名、`null`（部分 iframe 场景）、以及 fnOS 网关域名
3. 对 `/ttyd/*` 增加一次性 token 校验

---

## 2. P1 稳定性加固（建议本版本完成）

### 2.1 端口冲突检测

- `startDashboard` 前检测 `DASHBOARD_PORT` 是否被占用
- 安装向导选择端口时做可用性检测
- 被占用时返回明确错误，不盲目启动

### 2.2 进程管理加锁

- PID 文件加 `flock` 或写进程启动时间戳
- `isGatewayRunning` 增加进程名校验（`/proc/<pid>/comm` 或 `cmdline` 包含 `hermes`）
- 避免旧 PID 文件指向其他进程

### 2.3 卸载脚本安全加固

- 删除前校验 `DATA_DIR` 必须位于 `/var/apps/` 或 `/vol2/@apphome/`
- 不允许删除 `/`、`/var`、`/home` 等系统目录
- 删除前再次确认 `wizard_delete_data=true`

### 2.4 日志轮转

- `logger.js` 按天分割：`gateway-YYYY-MM-DD.log`
- 保留最近 7 天日志
- 读取日志时合并当天 + 前一天，保证连续性

---

## 3. P2 工程质量（可后续迭代）

### 3.1 前后端类型同步

- `build.sh` 中增加步骤：校验 `shared/api-types.ts` 与 `app_src/ui-vue/src/types/api.ts` 一致
- 不一致时抛出错误

### 3.2 错误处理与日志

- 减少空 `catch {}`，至少记录 warn 级别日志
- 统一错误响应格式：`{ ok: false, error: string, code: string }`

### 3.3 单元测试

- 新增 `tests/` 目录
- 优先覆盖：`serveStatic`、`parseEnvText`、`serializeEnv`、敏感字段脱敏、终端命令过滤

---

## 4. 版本规划

| 版本 | 内容 |
|------|------|
| v0.25.0 | 完成 1.1–1.5、2.1–2.4 |
| v0.25.1 | 完成 3.1–3.3，补测试 |
| v0.26.0 | 可选：引入更严格的身份认证中间件（如 panel token） |

---

## 5. 验证清单

- [ ] 构建成功，fpk 大小正常
- [ ] 真机安装后状态页正常
- [ ] 终端只能执行白名单命令
- [ ] API Key 不回显明文
- [ ] Dashboard 监听 127.0.0.1
- [ ] 端口冲突时有友好提示
- [ ] 卸载保留/删除两种模式均正常
- [ ] 日志按天分割
