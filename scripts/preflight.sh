#!/usr/bin/env bash
# preflight.sh — 发版前一致性自检门禁
#
# 检查项：
#  1. manifest / package.json / build-meta.json / README badge / AUDIT_REPORT 版本号一致
#  2. 仓库根无 *.fpk / *.sha256 残留（应 .gitignore）
#  3. config/hermes-version.env 不存在（已废弃，使用 manifest 作 SSOT）
#  4. cmd/install_callback 无硬编码版本号兜底（应使用 unknown）
#
# 退出码：0 = 通过；1 = 失败
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FAIL=0
red()    { printf '\033[0;31m%s\033[0m\n' "$*"; }
green()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[1;33m%s\033[0m\n' "$*"; }

echo "========== Hermes preflight =========="

# 1. 版本号一致性（委托给 sync-version.py --check）
echo ""
echo "[1/4] 版本号一致性 ..."
if python3 "$ROOT/scripts/sync-version.py" --check; then
  green "  -> 通过"
else
  red "  -> 失败：版本号不一致"
  FAIL=1
fi

# 2. 仓库根残留 fpk / sha256
echo ""
echo "[2/4] 仓库根残留文件 ..."
ROOT_RESIDUE=$(find "$ROOT" -maxdepth 1 \( -name '*.fpk' -o -name '*.sha256' \) 2>/dev/null || true)
if [ -n "$ROOT_RESIDUE" ]; then
  red "  -> 失败：发现残留文件，应加入 .gitignore 或删除："
  echo "$ROOT_RESIDUE" | sed 's/^/    /'
  FAIL=1
else
  green "  -> 通过"
fi

# 3. 弃用文件 config/hermes-version.env
echo ""
echo "[3/4] 弃用文件检查 ..."
if [ -f "$ROOT/config/hermes-version.env" ]; then
  red "  -> 失败：config/hermes-version.env 已弃用（manifest 是 SSOT），请删除"
  FAIL=1
else
  green "  -> 通过"
fi

# 4. install_callback 硬编码版本兜底
echo ""
echo "[4/4] install_callback 兜底值 ..."
if grep -E 'HERMES_VERSION="\$\{HERMES_VERSION:-[0-9]+\.[0-9]+\.[0-9]+' "$ROOT/cmd/install_callback" >/dev/null 2>&1; then
  red "  -> 失败：cmd/install_callback 仍有硬编码版本号兜底（如 :-0.30.3），应改成 :-unknown"
  grep -nE 'HERMES_VERSION="\$\{HERMES_VERSION:-[0-9]' "$ROOT/cmd/install_callback" | sed 's/^/    /'
  FAIL=1
else
  green "  -> 通过"
fi

echo ""
echo "========================================"
if [ $FAIL -eq 0 ]; then
  green "preflight: ALL CHECKS PASSED"
  exit 0
else
  red   "preflight: FAILED"
  exit 1
fi
