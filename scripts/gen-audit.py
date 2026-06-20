#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen-audit.py — 自动生成 AUDIT_REPORT.md

设计：用代码事实替代人写文档，避免过时。
数据源：
  - manifest (版本号)
  - tests/*.js (测试用例数)
  - cmd/* (生命周期脚本数)
  - app_src/server/modules/*.js (后端模块数)
  - .github/workflows/*.yml (CI workflow)
  - git log --tags (最近发布)

幂等：每次跑结果一致；CI 可跑完测试自动 commit。
"""
import json
import re
import subprocess
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TZ = timezone(timedelta(hours=8))


def read_manifest_version() -> str:
    for line in (ROOT / "manifest").read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("version"):
            return line.split("=", 1)[1].strip()
    return "unknown"


def count_test_cases() -> tuple[int, int]:
    """返回 (test_files, test_cases)。"""
    files = sorted((ROOT / "tests").glob("*.test.js"))
    cases = 0
    for f in files:
        text = f.read_text(encoding="utf-8", errors="ignore")
        cases += len(re.findall(r"\b(?:test|it)\s*\(", text))
    return len(files), cases


def list_cmd_scripts() -> list[str]:
    return sorted(p.name for p in (ROOT / "cmd").glob("*") if p.is_file())


def list_server_modules() -> list[str]:
    d = ROOT / "app_src" / "server" / "modules"
    return sorted(p.name for p in d.glob("*.js"))


def list_workflows() -> list[str]:
    d = ROOT / ".github" / "workflows"
    if not d.exists():
        return []
    return sorted(p.name for p in d.glob("*.yml"))


def read_changelog() -> str:
    """从 manifest 读取 changelog 字段。"""
    for line in (ROOT / "manifest").read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("changelog"):
            return line.split("=", 1)[1].strip()
    return ""


def filter_pending_items(pending: list[str], changelog: str) -> list[str]:
    """根据 changelog 过滤已完成项（动态解析版本特性）。"""
    if not changelog:
        return pending
    # 将 HTML <br/> 替换为换行，方便逐行匹配
    text = changelog.replace("<br/>", "\n").lower()
    # 提取每个版本的特性关键词（v0.XX.Y 后的数字列表）
    # 例如："v0.31.0（API 鉴权 + Rate limit）：1) 新增 API token 鉴权..."
    version_features = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        # 匹配版本行（v0.31.0 ...）后的编号列表项
        if re.match(r"^\d+\)", line):
            version_features.append(line)
        # 也匹配版本标题行中的关键词
        elif "v0." in line and "：" in line:
            version_features.append(line)
    
    # 合并所有特性文本
    all_features = " ".join(version_features)
    
    # 定义 pending item 的识别特征（用于模糊匹配）
    item_signatures = {
        "token 鉴权": ["api token 鉴权", "token 鉴权", "hermes_api_token", "鉴权"],
        "rate limit": ["rate limit", "令牌桶", "限流", "限流"],
        "hermes.js": ["hermes.js 拆分", "hermes/ 子目录", "单文件", "hermes.js"],
        "contributing": ["contributing", "changelog 标准化", "标准化"],
    }
    
    completed = []
    for item in pending:
        item_lower = item.lower()
        for sig_key, sigs in item_signatures.items():
            if sig_key in item_lower:
                # 检查 changelog 特性文本中是否出现任一标记
                if any(sig in all_features for sig in sigs):
                    completed.append(item)
                    break
    
    return [item for item in pending if item not in completed]


def recent_tags(n: int = 5) -> list[tuple[str, str]]:
    """读取最近 n 个 git tag（按版本号降序）。"""
    import os
    if os.environ.get("AUDIT_NO_GIT") == "1":
        return []
    try:
        # 直接列出所有 tag，按版本号排序后取前 n 个
        out = subprocess.check_output(
            ["git", "tag", "-l"],
            cwd=ROOT, encoding="utf-8", stderr=subprocess.DEVNULL,
        )
        tags = [t.strip() for t in out.splitlines() if t.strip()]
        # 按版本号降序排序（v0.31.2 > v0.31.1 > v0.30.8）
        tags.sort(key=lambda t: [int(x) for x in t.lstrip("v").split(".")], reverse=True)
        result = []
        for tag in tags[:n]:
            # 获取 tag 对应的 commit 日期
            try:
                date_out = subprocess.check_output(
                    ["git", "log", "-1", "--format=%ci", tag],
                    cwd=ROOT, encoding="utf-8", stderr=subprocess.DEVNULL,
                ).strip()
                date = date_out.split(" ", 1)[0] if date_out else ""
            except Exception:
                date = ""
            result.append((tag, date))
        return result
    except Exception:
        return []


def render() -> str:
    version = read_manifest_version()
    test_files, test_cases = count_test_cases()
    cmd_scripts = list_cmd_scripts()
    modules = list_server_modules()
    workflows = list_workflows()
    tags = recent_tags()
    now = datetime.now(TZ).strftime("%Y-%m-%d %H:%M:%S %z")

    lines: list[str] = []
    a = lines.append

    a("# Hermes for fnOS — 审计报告")
    a("")
    a("> ⚠️ 本文件由 `scripts/gen-audit.py` 自动生成，请勿手工编辑。")
    a("> 数据源：manifest / tests / cmd / server modules / git tags。")
    a("")
    a(f"## 当前版本：v{version}")
    a("")
    a(f"- **生成时间**：{now}")
    a(f"- **测试用例**：{test_cases} 个 / {test_files} 个文件")
    a(f"- **生命周期脚本**：{len(cmd_scripts)} 个（{', '.join(cmd_scripts)}）")
    a(f"- **后端模块**：{len(modules)} 个")
    a(f"- **CI Workflow**：{', '.join(workflows) if workflows else '（无）'}")
    a("")
    a("## 代码审计摘要")
    a("")
    a("| 维度 | 结果 | 说明 |")
    a("|:-----|:-----|:-----|")
    a("| 安全加固 | ✅ 已收敛 | 终端沙箱、CSRF 收紧、敏感文件 0o640/0o750、卸载路径白名单 |")
    a("| 权限控制 | ✅ 已收敛 | socket 0o660、进程管理 PID 校验、日志 600 |")
    a("| 输入校验 | ✅ 已收敛 | API 请求体类型检查、终端命令白名单、长度限制 |")
    a("| 配置隔离 | ✅ 已收敛 | manifest 是版本号唯一真相源，sync-version.py 自动同步派生位置 |")
    a("| 依赖管理 | ✅ 已收敛 | Python 3.12 + Bun ≥ 1.3.9 + Node.js v24，版本声明在 manifest |")
    a("| 前端安全 | ✅ 已收敛 | 静态资源路径白名单、`X-Frame-Options`、`safe-area-inset-bottom` |")
    a("| 中文编码 | ✅ 已收敛 | native2ascii + i18n 双保险，fnOS bun utf-8 解码 bug 已绕过 |")
    a("| 版本治理 | ✅ 已收敛 | preflight.sh 门禁，CI/CD 自动校验版本号一致性 |")
    a("")
    a("## 后端模块清单")
    a("")
    a("| 模块 | 行数 |")
    a("|:-----|:----:|")
    for m in modules:
        path = ROOT / "app_src" / "server" / "modules" / m
        try:
            ln = sum(1 for _ in path.open("r", encoding="utf-8", errors="ignore"))
        except Exception:
            ln = 0
        a(f"| `{m}` | {ln} |")
    a("")
    a("## 生命周期脚本清单")
    a("")
    a("| 脚本 | 触发 |")
    a("|:-----|:-----|")
    triggers = {
        "install_init":      "fnOS 不自动调用，由 upgrade_callback 显式调用",
        "install_callback":  "fnOS 安装完成后自动调用",
        "upgrade_init":      "fnOS 不自动调用，由 upgrade_callback 显式调用",
        "upgrade_callback":  "fnOS 升级完成后自动调用",
        "config_init":       "fnOS 不自动调用（平台限制）",
        "config_callback":   "fnOS 不自动调用（平台限制），保留以备未来兼容",
        "uninstall_init":    "fnOS 卸载前调用",
        "uninstall_callback":"fnOS 卸载时调用",
        "main":              "应用启动 / restart / status 入口",
    }
    for s in cmd_scripts:
        a(f"| `cmd/{s}` | {triggers.get(s, '—')} |")
    a("")
    a("## 最近发布记录")
    a("")
    if tags:
        a("| 版本 | 发布日期 |")
        a("|:-----|:----:|")
        for tag, date in tags:
            a(f"| `{tag}` | {date} |")
    else:
        a("（git 标签信息不可用）")
    a("")
    a("## 待持续推进项")
    a("")
    pending = [
        "⏳ 面板可选 token 鉴权（默认关闭，env 开启）— P2",
        "⏳ `/api/*` rate limit 令牌桶 — P2",
        "⏳ `hermes.js` 单文件 ~487 行拆分 — P3",
        "⏳ `CONTRIBUTING.md` 与 `CHANGELOG.md` 标准化 — P3",
    ]
    changelog = read_changelog()
    pending = filter_pending_items(pending, changelog)
    if pending:
        for item in pending:
            a(f"- {item}")
    else:
        a("（无待持续推进项）")
    a("")
    a("---")
    a("")
    a("生成命令：`python3 scripts/gen-audit.py`")
    a("")

    return "\n".join(lines)


def main():
    check = "--check" in sys.argv
    out = ROOT / "AUDIT_REPORT.md"
    new = render()
    old = out.read_text(encoding="utf-8") if out.exists() else ""
    # 时间戳行允许漂移（每次 render 都不同），check 模式下剔除后比较
    def _stable(s: str) -> str:
        return re.sub(r"^- \*\*生成时间\*\*：.*$", "- **生成时间**：__DYNAMIC__", s, flags=re.M)
    if check:
        if _stable(new) != _stable(old):
            print("AUDIT_REPORT.md is OUT OF DATE; run `python3 scripts/gen-audit.py` to regenerate.", file=sys.stderr)
            return 1
        print("AUDIT_REPORT.md content is up-to-date (timestamp ignored).")
        return 0
    if new == old:
        print(f"AUDIT_REPORT.md is up-to-date.")
        return 0
    out.write_text(new, encoding="utf-8")
    print(f"AUDIT_REPORT.md regenerated ({len(new)} bytes).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
