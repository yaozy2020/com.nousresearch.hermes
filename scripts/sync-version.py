#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync-version.py — 从 manifest 同步版本号到所有需要联动的位置。

设计原则：manifest 是唯一真相源（SSOT）。所有派生位置在 build 时自动同步。
任何需要新增联动位置的，都在本脚本里加 sync_xxx 函数。

用法:
    python3 scripts/sync-version.py            # 同步并打印结果
    python3 scripts/sync-version.py --check    # 只校验，不修改（CI 用）

退出码:
    0 = 全部同步成功 / 校验通过
    1 = 校验模式下发现不一致
    2 = 内部错误（找不到 manifest 等）
"""
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "manifest"


def read_manifest_version() -> str:
    if not MANIFEST.exists():
        print(f"ERROR: manifest not found at {MANIFEST}", file=sys.stderr)
        sys.exit(2)
    for line in MANIFEST.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("version"):
            _, _, val = line.partition("=")
            return val.strip()
    print("ERROR: version line not found in manifest", file=sys.stderr)
    sys.exit(2)


# -------- 各位置同步器 --------
# 每个 sync_* 函数返回 (changed, current_value, target_path_str)
# check 模式下只读不写

def sync_package_json(version: str, check: bool) -> tuple[bool, str, str]:
    p = ROOT / "package.json"
    if not p.exists():
        return False, "(missing)", str(p)
    data = json.loads(p.read_text(encoding="utf-8"))
    cur = data.get("version", "")
    if cur == version:
        return False, cur, str(p)
    if not check:
        data["version"] = version
        p.write_text(
            json.dumps(data, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
    return True, cur, str(p)


def sync_build_meta(version: str, check: bool) -> tuple[bool, str, str]:
    p = ROOT / "app_src" / "server" / "modules" / "build-meta.json"
    if p.exists():
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            data = {}
    else:
        data = {}
    cur = data.get("version", "")
    if cur == version:
        return False, cur, str(p)
    if not check:
        data["version"] = version
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(
            json.dumps(data, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
    return True, cur, str(p)


def sync_readme_badge(version: str, check: bool) -> tuple[bool, str, str]:
    """README badge 行 + 版本历史第一个 (当前版本) 标题"""
    p = ROOT / "README.md"
    if not p.exists():
        return False, "(missing)", str(p)
    text = p.read_text(encoding="utf-8")
    new_text = text
    changed = False
    cur_badge = "(unknown)"

    # badge: [![Version](https://img.shields.io/badge/version-X.Y.Z-blue)]
    badge_re = re.compile(
        r"(\[!\[Version\]\(https://img\.shields\.io/badge/version-)([^-]+)(-blue\)\]\(https://github\.com/yaozy2020/com\.nousresearch\.hermes/releases/tag/v)([^)]+)(\))"
    )
    m = badge_re.search(new_text)
    if m:
        cur_badge = m.group(2)
        if cur_badge != version or m.group(4) != version:
            new_text = badge_re.sub(
                lambda mm: f"{mm.group(1)}{version}{mm.group(3)}{version}{mm.group(5)}",
                new_text,
                count=1,
            )
            changed = True

    # 版本历史第一个 "(当前版本)" 标题：### v0.30.x（当前版本）
    cur_re = re.compile(r"^### v[0-9]+(?:\.[0-9]+)+(?:\.[0-9a-zA-Z]+)?（当前版本）", re.M)
    m2 = cur_re.search(new_text)
    expected_title = f"### v{version}（当前版本）"
    if m2:
        if m2.group(0) != expected_title:
            new_text = new_text.replace(m2.group(0), expected_title, 1)
            changed = True
    # 如果找不到 (当前版本) 标题，不强插（避免破坏结构）

    if changed and not check:
        p.write_text(new_text, encoding="utf-8")
    return changed, cur_badge, str(p)


def sync_audit_report(version: str, check: bool) -> tuple[bool, str, str]:
    """AUDIT_REPORT.md 第一行 '当前版本：v0.30.x'"""
    p = ROOT / "AUDIT_REPORT.md"
    if not p.exists():
        return False, "(missing)", str(p)
    text = p.read_text(encoding="utf-8")
    pat = re.compile(r"^(##\s*当前版本[:：]\s*v)([0-9.]+)(\s*$)", re.M)
    m = pat.search(text)
    if not m:
        return False, "(no-marker)", str(p)
    cur = m.group(2)
    if cur == version:
        return False, cur, str(p)
    new_text = pat.sub(lambda mm: f"{mm.group(1)}{version}{mm.group(3)}", text, count=1)
    if not check:
        p.write_text(new_text, encoding="utf-8")
    return True, cur, str(p)


SYNCERS = [
    ("package.json", sync_package_json),
    ("build-meta.json", sync_build_meta),
    ("README.md", sync_readme_badge),
    ("AUDIT_REPORT.md", sync_audit_report),
]


def main():
    check = "--check" in sys.argv
    version = read_manifest_version()
    print(f"manifest version = {version}")
    print(f"mode = {'check' if check else 'sync'}")
    print("-" * 60)

    any_diff = False
    for name, fn in SYNCERS:
        changed, cur, path = fn(version, check)
        rel = os.path.relpath(path, ROOT)
        if changed:
            any_diff = True
            tag = "DIFF" if check else "FIX "
            print(f"  [{tag}] {rel:40s}  {cur} -> {version}")
        else:
            print(f"  [ OK ] {rel:40s}  {cur}")

    print("-" * 60)
    if check and any_diff:
        print("FAIL: 检测到版本号不一致，请先运行 `python3 scripts/sync-version.py` 同步后再提交。")
        sys.exit(1)
    if check:
        print("PASS: 所有版本号已同步。")
    else:
        if any_diff:
            print(f"DONE: 已同步到 {version}。")
        else:
            print(f"DONE: 全部已是 {version}，无变化。")
    sys.exit(0)


if __name__ == "__main__":
    main()
