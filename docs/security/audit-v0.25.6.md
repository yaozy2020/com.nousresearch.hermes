# Hermes 控制面板 v0.25.6 安全审计报告

> 审计范围：`https://github.com/yaozy2020/com.nousresearch.hermes/tree/main` 浅克隆副本 `/tmp/hermes_audit`  
> 审计日期：2026-06-19  
> 审计方式：fresh audit（不依赖本地 MEMORY.md / 历史修复记录，直接基于 GitHub `main` 分支代码）  
> 已发版基线：v0.25.6（已合并到 main）

---

## 1. 甲方负责人视角（产品 & 合规）

### 1.1 结论
当前版本在**数据隔离、配置脱敏、卸载安全、终端沙箱**方面做了大量工作，整体基线比以往版本更结实；但仍有 2 个**可导致远程代码执行的高危组合风险**需要立即处理，否则“独立用户运行、默认隔离敏感目录”的产品声明会打折扣。

### 1.2 关键发现

| # | 问题 | 严重程度 | 说明 |
|---|------|----------|------|
| A1 | CSRF 校验对内网私有 IP 过度放行 | **P0 / 高危** | `security.js:74` 的兜底逻辑只要 `Origin/Referer` 是 `10.x / 172.16-31.x / 192.168.x` 就允许写操作，再加上 `Origin: null` 被放行，管理员一旦访问过任意恶意网页，就可能被跨站触发 panel 写接口。 |
| A2 | `/api/hermes/install` 接受任意 `packageSpec` | **P0 / 高危** | `index.js:194` 直接把请求体里的 `package` 传给 `installHermes()`，再到 `hermes.js:312` 执行 `pip install <packageSpec>`。与 A1 组合后，攻击者可静默在 NAS 上安装任意 PyPI/Git 包，等于 RCE。 |
| A3 | Dashboard 默认监听 `0.0.0.0` + `--insecure` | **P1 / 中高危** | 这是为 NAS 局域网场景做的妥协，但默认开启且文档未充分提示风险；若用户把 NAS 放到公网/访客网络，Dashboard 与 Gateway 将完全暴露。 |
| A4 | README / manifest 版本信息滞后 | **P1 / 中** | README badge 仍指向 `v0.25.4`，changelog 只到 `v0.24.1`；manifest 的 `changelog` 字段同样未更新 v0.25.x 的安全加固内容，会让用户低估当前版本改动。 |
| A5 | 向导页文案与安全默认不同步 | **P2 / 低** | 向导 Step 4 仍提示“在 `.env` 中添加 `HERMES_DASHBOARD_INSECURE=1`”，而 `install_callback` 已经默认写入该值，文案反而让用户以为当前是安全模式。 |

---

## 2. 产品经理视角（用户体验 & 风险感知）

### 2.1 结论
功能闭环已经比较完整，但**安全默认与用户心智之间存在断层**：产品默认把 Dashboard 完全放开，UI 却没有足够醒目的“未加密/未鉴权”提示；同时安装、配置、日志等关键反馈仍显生硬。

### 2.2 关键发现

| # | 问题 | 严重程度 | 说明 |
|---|------|----------|------|
| B1 | Dashboard 打开按钮缺少风险提示 | **P1 / 中** | 首页与向导的“打开 Dashboard”按钮未区分“本地回环安全”与“局域网明文无鉴权”两种状态，用户容易在公共网络中误点。 |
| B2 | 消息频道页使用非受控 DOM 读取 | **P2 / 低** | `pages/channels/index.vue` 用 `:model-value` + `document.getElementById` 取输入值，既无实时校验，也无法在保存前高亮必填项。 |
| B3 | 移动端终端跳转覆盖当前页 | **P2 / 低** | `pages/terminal/index.vue` 在移动设备直接 `window.location.href = './ttyd-mobile?cmd=...'`，用户执行完命令后需手动返回面板。 |
| B4 | 日志复制依赖 `navigator.clipboard` | **P2 / 低** | 在纯 HTTP 内网（非 localhost/HTTPS）下可能失败，没有降级提示。 |
| B5 | 安装进度反馈单一 | **P2 / 低** | pip 安装耗时较长，日志页可查看，但 wizard 里没有更明显的阶段提示或错误摘要。 |

---

## 3. 资深程序员视角（架构 & 代码质量）

### 3.1 结论
后端模块化、错误处理封装、单元测试、权限收紧都比 v0.25.4 之前好很多；但**核心安全函数仍存在兜底过度宽松**的问题，且工程化细节（魔数、超时、测试覆盖）有待补全。

### 3.2 关键发现

| # | 问题 | 严重程度 | 说明 |
|---|------|----------|------|
| C1 | `isSafeWriteRequest` 的 private-IP 兜底应删除 | **P0 / 高危** | `security.js` 第 72-75 行：`if (isPrivateIPv4(headerHost)) return true;` 取消了 `Host` 与来源的绑定关系。建议改为：仅当 `Host` 本身也是私有 IP / localhost 时，才允许同网段来源，并移除 `Origin: null` 写操作放行。 |
| C2 | 安装包参数需白名单 / 校验 | **P0 / 高危** | `hermes.js:312` 的 `packageSpec` 应限制为：a) 不允许 shell 元字符（已由数组参数规避）；b) 不允许 `@` 之后任意 URL；c) 推荐固定为 `hermes-agent` 或少量已知镜像，并提供“自定义”开关。 |
| C3 | GET `/ttyd*` 缺少来源校验入口 | **P1 / 中** | `isSafeWriteRequest` 只保护写方法，`index.js` 对 `/ttyd*` 的 GET 代理完全放行。虽然不能直接 POST，但可被恶意网页 iframe 嵌入做点击劫持或钓鱼。建议对 `/ttyd*` 也加 Referer/Origin 检查或 `X-Frame-Options: DENY`。 |
| C4 | 进程管理脚本有潜在孤儿进程风险 | **P1 / 中** | `cmd/main:58` 使用 `bash -c "${CMD}" &`，记录的是 bash 的 PID；kill bash 时 bun 子进程可能变成孤儿。建议改为 `exec bun ...` 或直接使用 `bun` 后台运行。 |
| C5 | `chmodSync` 使用十进制魔数 | **P2 / 低** | `hermes.js` 中 `chmodSync(HERMES_BIN, 493)` 可读性差，应改为 `0o755`。 |
| C6 | `parseBody` 静默吞掉 JSON 错误 | **P2 / 低** | `utils.js:15` 在 JSON 解析失败时返回 `{}`，调用方无法区分“空请求”和“非法 JSON”。 |
| C7 | 静态文件服务未区分文件/目录 | **P2 / 低** | `static.js` 在路径为目录时会尝试读取目录，可能泄露目录存在性或抛出非 404 错误。 |
| C8 | 缺少端到端 / 集成测试 | **P2 / 低** | 现有 34 个单元测试只覆盖模块函数，未覆盖 `Bun.serve` 路由、CSRF 中间件、静态文件服务集成。 |
| C9 | 超时控制不足 | **P2 / 低** | `installHermes` 中的 pip 进程没有 `timeout`，在异常网络下可能挂起。 |
| C10 | 错误码与日志不够结构化 | **P2 / 低** | 大量接口仍返回 `{ok:false, error:string}`，建议统一 error code，便于前端做国际化提示。 |

---

## 4. 客户端视角（最终用户 & 安装环境）

### 4.1 结论
在飞牛 NAS 真机环境中，v0.25.6 的功能表现已经可用；但**默认开启的不安全 Dashboard 模式**对普通用户是一把双刃剑，且部分文案会误导用户以为自己在“安全模式”下运行。

### 4.2 关键发现

| # | 问题 | 严重程度 | 说明 |
|---|------|----------|------|
| D1 | 安装后默认即可被局域网任何人访问 | **P1 / 中高危** | 默认 `HERMES_DASHBOARD_INSECURE=1`，绑定 `0.0.0.0`，任何拿到内网 IP 的人都能打开 Dashboard 并管理 Gateway。 |
| D2 | README 安全说明与默认行为矛盾 | **P1 / 中** | README `## Dashboard 安全模式` 仍写“默认仅监听 `127.0.0.1`”，与实际相反。 |
| D3 | 卸载选择保留数据时日志文件仍可能残留 | **P2 / 低** | `uninstall_callback` 在保留数据模式下仍清除了 socket/pid，但未清理 `logs/uninstall.log` 中可能包含的路径信息。 |
| D4 | 无应用内更新通道 | **P2 / 低** | 用户必须去应用中心手动升级，无法从面板一键触发 `upgrade_callback`。 |

---

## 5. 综合风险评级

| 优先级 | 数量 | 代表问题 | 建议处理方式 |
|--------|------|----------|--------------|
| **P0** | 2 | CSRF 过度放行 + 任意包安装 RCE | 必须修复，发 v0.25.7 |
| **P1** | 6 | Dashboard 默认暴露、文档滞后、ttyd 点击劫持、进程孤儿、文案误导 | 建议纳入 v0.25.7 |
| **P2** | 8 | 工程细节、测试覆盖、UX 打磨 | 可随 v0.25.7 或 v0.25.8 分批处理 |

---

## 6. 修复方案建议（v0.25.7）

### 6.1 P0 必须项

1. **收紧 CSRF 来源校验**
   - 删除 `security.js:74` “只要是私有 IP 就放行”的兜底。
   - 仅当 `Host` 本身是 localhost / 私有 IP / `HERMES_TRUSTED_HOSTS` 时，才允许对应来源。
   - 对写操作拒绝 `Origin: null`，或要求同时提供 `X-Requested-With` / CSRF token。
   - 新增回归测试：外网 Host + 内网 Origin 必须拒绝、Origin null 写操作必须拒绝。

2. **限制 Hermes 安装包来源**
   - 默认只允许固定包名：`hermes-agent`（PyPI）和 `git+https://github.com/NousResearch/hermes.git`。
   - 若支持自定义，需通过 UI 开关显式开启，并在后端校验：`^[A-Za-z0-9_.\-@/:=]+$`，禁止 `file://`、`--` 开关、shell 元字符。
   - 日志中不再直接输出用户输入的 `packageSpec`，改为输出“使用默认源 / 自定义源已启用”。

### 6.2 P1 重要项

3. **Dashboard 默认策略再平衡**
   - 保留 `HERMES_DASHBOARD_INSECURE=1` 作为 NAS 场景默认，但 UI 首页/向导增加醒目的“当前为局域网明文模式”提示。
   - 提供一键“锁定为本地模式”按钮，直接改写 `.env` 并提示用户去 fnOS 应用中心重启。

4. **ttyd 路径增加来源 /  framing 保护**
   - 对 `/ttyd*` GET 增加 `Referer` 校验（复用 `isSafeWriteRequest` 的来源判断逻辑）。
   - 响应头增加 `X-Frame-Options: DENY` / `Content-Security-Policy: frame-ancestors 'self'`。

5. **修复 `cmd/main` 进程管理**
   - 将 `bash -c "${CMD}" &` 改为 `exec bun ...` 子脚本，确保 kill 的就是 bun 进程。
   - 或直接使用 `bun "${SERVER_SCRIPT}" &` 并记录 `$!`。

6. **补齐文档与 manifest**
   - README badge 更新到 v0.25.7，changelog 补录 v0.25.4/5/6/7 安全与工程改进。
   - manifest `changelog` 字段同步更新，避免应用中心显示 stale 信息。

### 6.3 P2 打磨项

7. 工程细节：统一 `0o755/0o640` 写法；`parseBody` 非法 JSON 返回 `400`；静态文件服务先 `statSync` 判文件。
8. 测试：增加 `Bun.serve` 集成测试（至少覆盖 CSRF、静态文件、安装包参数校验）。
9. UX：频道页改为 `v-model` 并加必填校验；移动端终端用 `window.open` 或保留返回入口；日志复制失败给出降级提示。

---

## 7. 验证计划

1. **本地**：`npm test` / `bun test` 全部通过；新增 CSRF / 安装包校验回归测试。
2. **构建**：`bash build.sh` 成功，前后端类型同步脚本通过。
3. **真机**：重新打包 fpk 到 `/vol3/1000/下载盘/`，用户通过 fnOS 应用中心安装。
4. **真机检查项**：
   - 从另一台局域网机器伪造 `Origin: http://192.168.10.123` 向面板 POST `/api/gateway/start` → 应返回 403。
   - 尝试 POST `/api/hermes/install` 传 `package: "requests==2.32"` → 应被拒绝或需要显式自定义源开关。
   - Dashboard 首页出现“局域网明文模式”提示。
   - 终端 Ctrl+C / 停止 / 移动端跳转正常。

---

## 8. 附录：正面清单（已做得不错的部分）

- 终端命令白名单 + 元字符拦截（`terminal-shell.js`）
- 静态文件目录穿越防护（`static.js`）
- API Key / token 后端脱敏（`config.js`）
- 敏感目录/文件权限收紧到 `0o750` / `0o640`
- Unix socket `0o660`
- 卸载时数据目录白名单校验，避免 `rm -rf /`
- 单元测试 34 条全部通过
- 升级前自动备份配置并清理旧 runtime
