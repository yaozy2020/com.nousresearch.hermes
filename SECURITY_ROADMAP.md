# Hermes for fnOS — 安全加固与工程质量改进路线图

> 当前目标版本：v0.25.6（治理版）  
> 当前分支：`governance-v0.25.6`  
> 本路线图基于对 v0.24.1 的甲方/产品/技术三方审计结论，以及 v0.25.4 / v0.25.5 的实施经验持续更新。

---

## 0. 总体原则

- **安全 > 正确 > 稳定 > 性能 > 优雅**
- **最小可用改动**：尽量在现有架构内修补，不推翻重做
- **向后兼容**：已安装用户的配置、venv、数据目录不破坏
- **可验证**：每处改动配套本地测试命令

---

## 1. 已完成的治理（归档）

### v0.25.4 — P0 安全加固

| 项 | 状态 | 关键落地 |
|:---|:----:|:---------|
| Web 终端沙箱化 | ✅ | `terminal-shell.js` 白名单 + 元字符拦截 |
| 敏感配置脱敏 | ✅ | 后端返回 `__MASKED__`，保存时未修改保留原值 |
| Dashboard 访问模式 | ✅ | 默认绑定 `0.0.0.0` 允许局域网访问；`HERMES_DASHBOARD_INSECURE=0` 可锁回仅本地 |
| 静态文件路径安全 | ✅ | `path.resolve` + `startsWith(STATIC_DIR)` 目录穿越防护 |
| API 来源校验（初版） | ✅ | 写操作增加 Origin/Referer 校验 |

### v0.25.5 — P2 工程质量

| 项 | 状态 | 关键落地 |
|:---|:----:|:---------|
| 前后端类型同步 | ✅ | `scripts/check-api-types.cjs` 接入 `build.sh` |
| 统一错误处理 | ✅ | `app_src/server/modules/error.js`（`swallowError` / `errorResponse`） |
| 单元测试 | ✅ | `tests/` 17 个用例 |
| 日志标签与轮转 | ✅ | `[panel/gateway/dashboard/terminal]` 前缀 + 按天轮转 + 7 天清理 |
| UI 版本号对齐 | ✅ | StatusCard `#details` slot + CSS grid 两列布局 |

---

## 2. v0.25.6 — 下一轮治理

### 2.1 P0 服务端路由鉴权增强

**问题**：当前 `isSafeWriteRequest` 对任意主机的请求，只要 `Referer` 路径以 `/app/com-nousresearch-hermes` 开头就放行，可被第三方站点伪造。

**方案**：
1. 移除“任意主机 + 路径前缀”的宽松匹配。
2. 仅允许：
   - 同源（`Origin`/`Referer` host 等于请求 host）
   - `Origin: null`（本地文件/iframe sandbox 场景）
   - 显式配置的 `HERMES_TRUSTED_HOSTS`（如 fnOS 网关域名）
3. 对 `/ttyd/*` 代理增加一次性 token 或强 referer 校验，防止外部直接访问终端。
4. 错误响应统一走 `errorResponse("untrusted origin", "FORBIDDEN_ORIGIN", 403)`。

**验收标准**：
```bash
# 带任意第三方 Referer 的 POST /api/gateway/start 应返回 403
curl -X POST -H "Referer: https://evil.com/app/com-nousresearch-hermes" ... /api/gateway/start
```

### 2.2 P1 日志目录权限审计

**问题**：`logger.js` 创建目录和文件时使用默认 umask，可能世界可读，导致日志中的配置/渠道信息泄露。

**方案**：
1. `mkdirSync(LOG_DIR, { recursive: true, mode: 0o750 })`
2. 写日志文件前，若文件不存在则先 `writeFileSync(path, "", { mode: 0o640 })`
3. 进程启动时设置 `process.umask(0o077)` 或显式设置文件 mode
4. 审计日志内容：确认 `broadcastLog` 不会把 `.env` 明文或 token 写入日志

**验收标准**：
```bash
ls -ld logs/        # drwxr-x---
ls -l logs/*.log    # -rw-r-----
```

### 2.3 P1 安装/升级/卸载脚本安全加固

**问题**：
- `cmd/upgrade_callback` 为空，升级时无法安全迁移。
- `cmd/install_callback` 中部分变量未加引号，路径含空格会出错。
- `cmd/uninstall_callback` 日志默认写入 `/tmp/uninstall.log`，世界可写，可能被占坑。

**方案**：
1. `upgrade_callback`：
   - 备份旧 `config.yaml` / `.env`
   - 清理旧 PID / socket / runtime
   - 若版本跨度大，提示用户手动迁移
   - 始终 `exit 0`，不因升级失败导致 fnOS 标记应用损坏
2. `install_callback`：
   - 所有路径变量加双引号
   - 校验 `HERMES_DASHBOARD_PORT` 为 1–65535 数字
   - 不写任何可能包含用户输入的默认配置
3. `uninstall_callback`：
   - 日志写入 `${TRIM_PKGVAR:-${TRIM_PKGHOME:-/tmp}}` 下的相对安全目录，或优先写入 stderr
   - `wizard_delete_data` 取值后加引号比较
   - 删除操作前先 `is_safe_data_dir` 校验

### 2.4 P1 进程与端口安全

**问题**：
- PID 文件默认权限 644，其他用户可读内部 PID。
- 端口冲突检测只在 Dashboard，未覆盖 ttyd / Gateway 监听端口。

**方案**：
1. PID 文件写入时指定 `mode: 0o640`
2. `startGateway` / `startDashboard` / `startTtyd` 启动前检测目标端口是否被占用
3. `isProcessAlive` 增加 `/proc/<pid>/comm` 校验，避免误信旧 PID

### 2.5 P2 测试补强

新增用例覆盖：
1. CSRF/Origin 拒绝：第三方 origin、缺失 origin 的 POST
2. 日志目录权限：创建后 mode 校验
3. 安装/升级/卸载脚本 dry-run：用临时目录验证路径安全
4. PID 文件权限与进程名校验

---

## 3. 版本规划

| 版本 | 内容 |
|------|------|
| v0.25.4 | P0 安全加固 |
| v0.25.5 | P2 工程质量 |
| **v0.25.6** | **P1 脚本/权限/鉴权深化治理** |
| v0.26.0 | 可选：引入面板级 session token，进一步分离公开端点与管理端点 |

---

## 4. 验证清单

- [ ] 构建成功，`npm test` 全绿
- [ ] 第三方 origin 的写操作被拒绝
- [ ] `/ttyd/*` 无法绕过面板直接访问
- [ ] `logs/` 目录 750、日志文件 640
- [ ] 升级回调正常退出且不破坏数据
- [ ] 卸载保留/删除两种模式均正常
- [ ] 端口冲突时有友好提示
- [ ] fpk 生成成功且可真机验证
