#!/bin/bash
# ============================================================================
# Hermes FPK 卸载验证脚本
# ============================================================================
# 用途：拍快照 → 在 fnOS 应用商店执行卸载 → 跑此脚本对照检查残留
# 作者：阿爪 🐾  for yaozy2020/com.nousresearch.hermes
# ============================================================================
# 用法：
#   阶段 0（卸载前）：bash hermes_uninstall_verify.sh snapshot
#   阶段 1（卸载后）：bash hermes_uninstall_verify.sh check keep      # 验「保留数据」
#   阶段 2（卸载后）：bash hermes_uninstall_verify.sh check wipe      # 验「清除全部数据」
# ============================================================================

set -u

APP_ID="com.nousresearch.hermes"
APP_USER="$APP_ID"            # fnOS 独立用户 = appname

# 路径常量（与 fnOS TRIM_* 对齐）
APPCENTER="/vol2/@appcenter/$APP_ID"     # = TRIM_APPDEST，被卸载完全删
APPHOME="/vol2/@apphome/$APP_ID"          # = TRIM_PKGHOME，wipe=true 时全删
APPCONF="/vol2/@appconf/$APP_ID"          # = TRIM_PKGCONF
APPDATA="/vol2/@appdata/$APP_ID"          # = TRIM_PKGVAR（日志）
APPMETA="/vol2/@appmeta/$APP_ID"
APPTEMP="/vol2/@apptemp/$APP_ID"
APPSHARE="/vol2/@appshare/$APP_ID"
VAR_APPS="/var/apps/$APP_ID"
SOCK="$APPCENTER/com.nousresearch.hermes.sock"

SNAPSHOT="/tmp/hermes_uninstall_snapshot.txt"
COLOR_R='\033[0;31m'
COLOR_G='\033[0;32m'
COLOR_Y='\033[1;33m'
COLOR_B='\033[1;34m'
COLOR_N='\033[0m'

FAIL_COUNT=0
WARN_COUNT=0

ok()   { echo -e "  ${COLOR_G}✅ $*${COLOR_N}"; }
fail() { echo -e "  ${COLOR_R}❌ $*${COLOR_N}"; FAIL_COUNT=$((FAIL_COUNT+1)); }
warn() { echo -e "  ${COLOR_Y}⚠️  $*${COLOR_N}"; WARN_COUNT=$((WARN_COUNT+1)); }
info() { echo -e "  ${COLOR_B}ℹ️  $*${COLOR_N}"; }
hr()   { echo "----------------------------------------------------------------------"; }
title() { echo; echo -e "${COLOR_B}=== $* ===${COLOR_N}"; }

# ============================================================================
# 阶段 0：卸载前快照
# ============================================================================
do_snapshot() {
  title "阶段 0 · 卸载前快照"

  if [ ! -d "$VAR_APPS" ]; then
    fail "$VAR_APPS 不存在，应用未安装。请先装好 v0.21.1 再跑此命令"
    exit 1
  fi

  {
    echo "# Hermes 卸载前快照 - $(date '+%F %T')"
    echo
    echo "## 顶层目录"
    ls -la "$VAR_APPS"  2>&1 | head -20
    echo
    echo "## appcenter (TRIM_APPDEST)"
    ls -la "$APPCENTER" 2>&1
    echo
    echo "## apphome (TRIM_PKGHOME)"
    ls -la "$APPHOME"   2>&1
    echo
    echo "## apphome/data 子目录大小"
    du -sh "$APPHOME"/data/* 2>/dev/null
    echo
    echo "## socket / pid 文件"
    ls -la "$SOCK" 2>&1
    ls -la "$APPHOME"/data/runtime/*.pid 2>&1
    echo
    echo "## 当前进程"
    ps -ef | grep -iE "hermes|nousresearch|ttyd" | grep -v grep
    echo
    echo "## socket /api/status"
    curl -s --max-time 3 --unix-socket "$SOCK" http://localhost/api/status 2>&1 | head -c 500
    echo
    echo
    echo "## 监听端口"
    ss -ltnp 2>/dev/null | grep -E "9119|9123|9128"
    echo
    echo "## systemd user units (用户身份运行的 hermes-cli setup 会污染这里)"
    find /home /root -maxdepth 6 -path '*/.config/systemd/user/hermes*.service' 2>/dev/null
    find "$APPHOME" -maxdepth 6 -name 'hermes*.service' 2>/dev/null
    echo
    echo "## fnOS 应用元目录"
    ls -la "$APPDATA"  2>&1
    ls -la "$APPCONF"  2>&1
    ls -la "$APPMETA"  2>&1
    ls -la "$APPTEMP"  2>&1
    echo
    echo "## /tmp 下 hermes 临时痕迹"
    find /tmp -maxdepth 2 -name 'hermes*' -o -name '*nousresearch*' 2>/dev/null
  } | tee "$SNAPSHOT" >/dev/null

  ok "快照已写入：$SNAPSHOT"
  hr
  echo "下一步："
  echo "  1) 打开 fnOS 应用中心 → Hermes AI 助手 → 卸载"
  echo "  2) 选择「保留现有文件」（第一次测试）"
  echo "  3) 等卸载完成（fnOS 提示成功）"
  echo "  4) 跑：bash $0 check keep"
  echo
  echo "  之后再装一次 → 卸载选「清除所有应用数据文件」 → 跑 check wipe"
}

# ============================================================================
# 通用检查：进程 / 端口 / socket 全死
# ============================================================================
check_processes() {
  title "进程残留检查"

  local procs
  procs=$(ps -ef | grep -iE "hermes|nousresearch|ttyd" | grep -v grep | grep -v "$0" || true)
  if [ -z "$procs" ]; then
    ok "无 hermes/bun/ttyd 残留进程"
  else
    fail "发现残留进程："
    echo "$procs" | sed 's/^/      /'
  fi

  title "端口残留检查"
  local ports
  ports=$(ss -ltnp 2>/dev/null | grep -E ":(9119|9123|9128)\b" || true)
  if [ -z "$ports" ]; then
    ok "9119 / 9123 / 9128 端口全部释放"
  else
    fail "仍有端口被占用："
    echo "$ports" | sed 's/^/      /'
  fi

  title "Unix socket / PID 文件检查"
  if [ -e "$SOCK" ]; then
    fail "socket 残留：$SOCK"
  else
    ok "socket 已清"
  fi

  local stale_pids
  stale_pids=$(find "$APPHOME/data/runtime" -maxdepth 1 -name '*.pid' 2>/dev/null || true)
  if [ -z "$stale_pids" ]; then
    ok "runtime/*.pid 已清"
  else
    warn "runtime 目录下仍有 pid 文件（如选「保留」是正常）："
    echo "$stale_pids" | sed 's/^/      /'
  fi
}

# ============================================================================
# 已知会残留的「systemd user unit」检查（重点）
# ============================================================================
check_systemd_pollution() {
  title "systemd user unit 残留检查（已知坑）"

  local found=()
  while IFS= read -r f; do
    [ -n "$f" ] && found+=("$f")
  done < <(find /home /root -maxdepth 6 -path '*/.config/systemd/user/hermes*.service' 2>/dev/null)

  while IFS= read -r f; do
    [ -n "$f" ] && found+=("$f")
  done < <(find "$APPHOME" -maxdepth 6 -name 'hermes*.service' 2>/dev/null)

  if [ ${#found[@]} -eq 0 ]; then
    ok "无 systemd user unit 残留"
  else
    warn "发现 systemd user unit（fpk 卸载脚本管不到，需手动清）："
    for f in "${found[@]}"; do
      echo "      $f"
    done
    echo
    info "建议手动执行："
    info "  systemctl --user disable hermes-gateway hermes-dashboard 2>/dev/null"
    info "  rm -f <上述文件>"
    info "  systemctl --user daemon-reload"
  fi
}

# ============================================================================
# 阶段 1：保留数据
# ============================================================================
check_keep() {
  title "阶段 1 · 验证「保留数据」卸载"

  if [ -d "$APPCENTER" ] || [ -d "$VAR_APPS" ]; then
    fail "应用本体未被移除：$APPCENTER 或 $VAR_APPS 仍存在"
    ls -la "$VAR_APPS" 2>&1 | head -10 | sed 's/^/      /'
  else
    ok "应用本体已移除（$VAR_APPS / $APPCENTER 不存在）"
  fi

  if [ -d "$APPHOME" ]; then
    ok "apphome 数据保留：$APPHOME"
    info "数据子目录："
    du -sh "$APPHOME"/data/* 2>/dev/null | sed 's/^/      /' \
      || warn "无权列目录（属正常，独立用户隔离）"
  else
    fail "apphome 不应被删但已不存在：$APPHOME"
  fi

  check_processes
  check_systemd_pollution
  emit_summary "保留数据"
}

# ============================================================================
# 阶段 2：清除全部数据
# ============================================================================
check_wipe() {
  title "阶段 2 · 验证「清除全部数据」卸载"

  for d in "$APPCENTER" "$VAR_APPS"; do
    if [ -d "$d" ]; then
      fail "应用本体未被移除：$d"
    else
      ok "已清除：$d"
    fi
  done

  if [ -d "$APPHOME" ]; then
    # apphome 目录是 fnOS 框架创建的，父目录 /vol2/@apphome/ 由 root 拥有
    # 我们的卸载脚本以独立用户 (com.nousresearch.hermes) 身份运行，
    # 没有权限删 /vol2/@apphome/<app>/ 这层壳——这是 fnOS 设计如此，正常现象
    # 我们只需验证：data/ 内容已清空即可
    if [ -d "$APPHOME/data" ]; then
      fail "apphome/data 仍存在（用户数据未清干净）：$APPHOME/data"
      ls -la "$APPHOME/data" 2>&1 | head -10 | sed 's/^/      /'
    else
      # 空壳目录由 fnOS 框架管理，rmdir 权限不足是预期行为
      remaining=$(ls -A "$APPHOME" 2>/dev/null)
      if [ -z "$remaining" ]; then
        ok "apphome 已清空（剩 4KB 空壳由 fnOS 框架管理，符合预期）：$APPHOME"
      else
        fail "apphome 仍有残留文件：$remaining"
        ls -la "$APPHOME" 2>&1 | head -10 | sed 's/^/      /'
      fi
    fi
  else
    ok "apphome 已完全清除：$APPHOME"
  fi

  for d in "$APPCONF" "$APPDATA" "$APPMETA" "$APPTEMP" "$APPSHARE"; do
    if [ -d "$d" ]; then
      warn "fnOS 元目录未清（fnOS 自管，可能正常）：$d"
    else
      ok "已清除：$d"
    fi
  done

  check_processes
  check_systemd_pollution
  emit_summary "清除全部数据"
}

# ============================================================================
# 总结
# ============================================================================
emit_summary() {
  hr
  title "总结 · $1 模式"
  if [ "$FAIL_COUNT" -eq 0 ] && [ "$WARN_COUNT" -eq 0 ]; then
    echo -e "  ${COLOR_G}🎉 全部检查通过，卸载干净${COLOR_N}"
  else
    echo -e "  ${COLOR_R}失败 $FAIL_COUNT 项${COLOR_N} / ${COLOR_Y}警告 $WARN_COUNT 项${COLOR_N}"
  fi
  hr
}

# ============================================================================
# 入口
# ============================================================================
case "${1:-}" in
  snapshot)
    do_snapshot
    ;;
  check)
    case "${2:-}" in
      keep) check_keep ;;
      wipe) check_wipe ;;
      *) echo "用法：$0 check {keep|wipe}"; exit 1 ;;
    esac
    ;;
  *)
    cat <<EOF
Hermes FPK 卸载验证脚本

用法：
  bash $0 snapshot         # 卸载前先拍快照
  bash $0 check keep       # 卸载后（选「保留」）跑此命令
  bash $0 check wipe       # 卸载后（选「清除全部数据」）跑此命令

推荐流程（往返测试，约 30 分钟）：
  1) 装 v0.21.1 → 启动 gateway/dashboard → 用一会儿
  2) bash $0 snapshot
  3) fnOS 卸载（保留数据）→ bash $0 check keep
  4) 重新装 v0.21.1 → 验证旧数据是否复用 → 再次启动服务
  5) fnOS 卸载（清除所有应用数据文件）→ bash $0 check wipe

EOF
    exit 0
    ;;
esac
