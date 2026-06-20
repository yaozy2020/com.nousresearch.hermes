#!/bin/bash
# Hermes FPK 打包脚本
# 用法: bash build.sh

set -e

PROJ_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_SRC="$PROJ_DIR/app_src"
BUILD_DIR="$PROJ_DIR/build"
VERSION=$(grep '^version' "$PROJ_DIR/manifest" | awk -F'=' '{print $2}' | tr -d ' ')
OUTPUT="$PROJ_DIR/com.nousresearch.hermes_v${VERSION}.fpk"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "===== Hermes FPK 打包 ====="

# v0.30.8: 版本号 SSOT 治理 — 从 manifest 同步派生位置 + preflight 门禁
echo "[0a/6] 版本号 SSOT 同步 ..."
python3 "$PROJ_DIR/scripts/sync-version.py" || {
  echo -e "${RED}ERROR: 版本号同步失败${NC}"
  exit 1
}

echo "[0b/6] AUDIT_REPORT 自动生成 ..."
python3 "$PROJ_DIR/scripts/gen-audit.py" || echo -e "${YELLOW}  警告：AUDIT_REPORT 生成失败（非致命）${NC}"

echo "[0c/6] preflight 一致性门禁 ..."
bash "$PROJ_DIR/scripts/preflight.sh" || {
  echo -e "${RED}ERROR: preflight 失败，请修复上述问题后重试${NC}"
  exit 1
}

# 0. 把版本号写入构建元数据，避免真机运行时依赖 manifest 权限/路径
echo "[0/6] 写入构建元数据 ..."
echo "{\"version\":\"$VERSION\"}" > "$APP_SRC/server/modules/build-meta.json"

# v0.30.5: 同步 manifest 版本到 package.json，避免漂移
# v0.30.8: 已统一由 scripts/sync-version.py 处理（步骤 0a），保留此段为 no-op 兼容旧脚本调用

# 1. 准备 build 目录
echo "[1/6] 准备 build 目录 ..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# 2. 构建前端 UI（Vue 3 + Nuxt UI）
echo "[2/6] 构建前端 UI ..."

# 优先使用 bun；当前环境未安装 bun 时回退到 npm（仅作兜底）
if command -v bun >/dev/null 2>&1; then
  PKG_MANAGER="bun"
  RUN_CMD="bun x"
  INSTALL_CMD="bun install --ignore-scripts"
  echo "  使用 Bun 工具链"
elif command -v npm >/dev/null 2>&1; then
  PKG_MANAGER="npm"
  RUN_CMD="npx"
  INSTALL_CMD="npm install"
  echo -e "${YELLOW}  警告：未找到 bun，临时回退到 npm。建议安装 bun 以保持一致性。${NC}"
else
  echo -e "${RED}ERROR: 未找到 bun 或 npm，无法构建前端${NC}"
  exit 1
fi

# 生产构建使用 fnOS 网关绝对路径，避免无尾斜杠访问时相对路径解析错误
export VITE_BASE_PATH="/app/com-nousresearch-hermes/"

# 校验前后端 API 类型定义是否同步（忽略注释、空白、分号差异）
node "$PROJ_DIR/scripts/check-api-types.cjs" || exit 1

# 运行单元测试（Bun 优先，否则 Node.js）
echo "  运行单元测试 ..."
if command -v bun >/dev/null 2>&1; then
  TEST_DATA_DIR="$(mktemp -d /tmp/hermes-test-XXXXXX)"
  export HERMES_DATA_DIR="$TEST_DATA_DIR"
  export HERMES_HOME="$TEST_DATA_DIR/home"
  export HERMES_CONFIG_DIR="$TEST_DATA_DIR/home"
  cd "$PROJ_DIR" && bun test || exit 1
else
  # 非 root / 非应用用户环境下，默认 /var/apps 路径不可写，使用临时目录运行测试
  TEST_DATA_DIR="$(mktemp -d /tmp/hermes-test-XXXXXX)"
  export HERMES_DATA_DIR="$TEST_DATA_DIR"
  export HERMES_HOME="$TEST_DATA_DIR/home"
  export HERMES_CONFIG_DIR="$TEST_DATA_DIR/home"
  cd "$PROJ_DIR" && npm test || exit 1
fi

if [ "$PKG_MANAGER" = "bun" ]; then
  BUILD_CMD="bun ./node_modules/vite/bin/vite.js build"
else
  BUILD_CMD="$RUN_CMD vite build"
fi

cd "$APP_SRC/ui-vue"

# 清理旧依赖并重新安装（避免不同环境 ABI 不一致）
if [ -d node_modules ]; then
  echo "  清理旧 node_modules ..."
  rm -rf node_modules
fi

# bun 与 package-lock.json 同时存在时可能触发 lockfile 迁移错误，清理掉 npm lockfile
if [ "$PKG_MANAGER" = "bun" ] && [ -f package-lock.json ]; then
  echo "  清理 package-lock.json ..."
  rm -f package-lock.json
fi

echo "  安装前端依赖（$PKG_MANAGER）..."
$INSTALL_CMD

# 清理旧 dist，避免 public 里已删除的文件残留到产物
rm -rf "$APP_SRC/ui-vue/dist"

echo "  构建生产包 ..."
$BUILD_CMD

cd "$PROJ_DIR"

# 将构建产物搬运到 app_src/ui，保留 config / images
UI_DIR="$APP_SRC/ui"
DIST_DIR="$APP_SRC/ui-vue/dist"
echo "  同步构建产物到 $UI_DIR ..."
mkdir -p "$UI_DIR"
# 删除旧的构建产物，但保留 config 与 images
find "$UI_DIR" -maxdepth 1 -type f ! -name 'config' -delete || true
rm -rf "$UI_DIR/public"
# 复制新产物
cp -a "$DIST_DIR/"* "$UI_DIR/"

# 验证构建产物
if [ ! -f "$APP_SRC/ui/index.html" ]; then
  echo -e "${RED}ERROR: 前端构建失败，$APP_SRC/ui/index.html 不存在${NC}"
  exit 1
fi

# 3. 准备 fnpack 所需的 app 目录（server + ui + bin）
echo "[3/6] 准备 app 目录 ..."
# 验证 ttyd 二进制存在
if [ ! -x "$APP_SRC/bin/ttyd" ]; then
  echo -e "${RED}ERROR: $APP_SRC/bin/ttyd 不存在或不可执行，无法打包${NC}"
  exit 1
fi
# 清理并复制运行时所需的最小集合（不要源码和 node_modules）
APP_DIR="$BUILD_DIR/app"
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"
cp -a "$APP_SRC/server" "$APP_DIR/"
cp -a "$APP_SRC/ui" "$APP_DIR/"
cp -a "$APP_SRC/bin" "$APP_DIR/"

# fnOS service 启动 bun 1.3.9 时会把 utf-8 源文件按 latin-1 解码（同一个 bun
# 二进制用 hermes 用户跑就 9 个 char，用其他用户跑就正常 3 个 char，env
# 完全相同。无法在 fnOS 修复，绕过办法：把所有非 ASCII 字符 \uXXXX 转义。
echo "  转义 server/*.js 中的非 ASCII 字符（绕过 fnOS bun 加载 bug）..."
find "$APP_DIR/server" -type f -name "*.js" -print0 | xargs -0 python3 "$PROJ_DIR/scripts/native2ascii.py"

# 4. 复制 manifest / ICON / cmd / config / wizard 到 build 目录
echo "[4/5] 复制元数据与回调脚本 ..."
cp "$PROJ_DIR/manifest" "$BUILD_DIR/"
cp "$PROJ_DIR/ICON.PNG" "$BUILD_DIR/"
cp "$PROJ_DIR/ICON_256.PNG" "$BUILD_DIR/"
cp -a "$PROJ_DIR/cmd" "$BUILD_DIR/"
cp -a "$PROJ_DIR/config" "$BUILD_DIR/"
cp -a "$PROJ_DIR/wizard" "$BUILD_DIR/"

# 5. 使用 fnpack 打包 fpk
echo "[5/5] 使用 fnpack 打包 ..."
if ! command -v fnpack >/dev/null 2>&1; then
  echo -e "${RED}ERROR: 未找到 fnpack 命令，无法生成有效 fpk${NC}"
  exit 1
fi
cd "$BUILD_DIR"
fnpack build -d "$BUILD_DIR"
cd "$PROJ_DIR"
mv -f "$BUILD_DIR/com.nousresearch.hermes.fpk" "$OUTPUT"

# 验证
echo ""
echo -e "${GREEN}===== 打包完成 =====${NC}"
echo "输出: $OUTPUT"
ls -lh "$OUTPUT"

# v0.30.5: 计算 fpk SHA256，注入 manifest checksum 字段（闭环防篡改）
if command -v sha256sum >/dev/null 2>&1; then
  CHECKSUM=$(sha256sum "$OUTPUT" | awk '{print $1}')
  echo ""
  echo "SHA256: $CHECKSUM"
  # 写回 manifest（仅在工作树中，方便下次发版时 git diff 看见）
  if grep -q '^checksum' "$PROJ_DIR/manifest"; then
    sed -i -E "s|^checksum.*$|checksum              = ${CHECKSUM}|" "$PROJ_DIR/manifest"
    echo "  已写入 manifest checksum 字段（请记得 git commit）"
  fi
  # 同时输出 .sha256 文件方便 release 上传
  echo "$CHECKSUM  $(basename "$OUTPUT")" > "${OUTPUT}.sha256"
  echo "  校验文件: ${OUTPUT}.sha256"
else
  echo -e "${YELLOW}  警告：未找到 sha256sum，跳过 checksum 注入${NC}"
fi
