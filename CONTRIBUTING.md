# Contributing to Hermes for fnOS

感谢你考虑为本项目贡献代码。本指南帮助你快速进入开发流程。

## 开发环境

- **运行时**：Node.js v24 + Bun ≥ 1.3.9（fnOS 应用包要求）
- **前端**：Vue 3 + Nuxt UI v4 + TailwindCSS v4
- **打包**：fnOS `fnpack`（仓库内已附）

## 本地开发

```bash
# 1. 克隆 + 安装依赖
git clone https://github.com/yaozy2020/com.nousresearch.hermes.git
cd com.nousresearch.hermes
cd app_src/ui-vue && bun install

# 2. 运行后端测试
bun test    # 或 npm test

# 3. 构建前端
cd app_src/ui-vue && bun run build

# 4. 完整打包（需要 fnpack）
bash build.sh
```

## 提交前自检（强制）

```bash
# 版本号一致性 + 仓库结构 + cmd 兜底值
bash scripts/preflight.sh
```

未通过 preflight 的 PR 会被 CI 拒绝。

## 版本号治理

本项目以 `manifest` 的 `version` 字段作为**唯一真相源（SSOT）**。
派生位置（package.json / build-meta.json / README badge / AUDIT_REPORT）由
`scripts/sync-version.py` **自动同步**，请勿手工修改。

发版流程：

```bash
# 1. 改 manifest 版本号
sed -i 's/^version.*/version               = 0.30.8/' manifest

# 2. 自动同步派生位置
python3 scripts/sync-version.py

# 3. 自动更新 AUDIT_REPORT.md
python3 scripts/gen-audit.py

# 4. preflight 自检
bash scripts/preflight.sh

# 5. 提交并打 tag
git add -A && git commit -m "release: v0.30.8"
git tag v0.30.8
```

## Commit 风格

- `feat: 新功能描述`
- `fix: 修复内容`
- `docs: 文档变更`
- `refactor: 重构`
- `test: 测试相关`
- `chore: 构建 / CI / 工具链`
- `release: vX.Y.Z`

## 测试要求

任何修改 `app_src/server/` 或 `cmd/` 的 PR 都必须包含或更新对应测试。

测试位置：
- 后端单元测试：`tests/*.test.js`
- 集成测试：`tests/integration-server.test.js`（自动跳过缺 bun 的环境）

## fnOS 平台特性（必读）

1. **生命周期回调**：`install_callback` / `upgrade_callback` / `uninstall_callback` 自动调用；`*_init` / `config_callback` 不自动调用，需要由 `upgrade_callback` 显式触发。
2. **TRIM_* 路径**：`TRIM_PKGHOME=/vol2/@apphome/<pkg>`（无 `/home` 子层）。
3. **bun 1.3.9 utf-8 编码 bug**：fnOS service 启动 bun 时按 latin-1 解码 utf-8 源，需要 `scripts/native2ascii.py` 在打包时转义。
4. **wizard JSON 格式**：`field` 而非 `name`；`rules` 是对象数组 `[{required:true, message:"..."}]`；`initValue` 是字符串。

## 安全声明

报告安全漏洞请直接邮件给维护者，不要在公开 Issue 提交。
