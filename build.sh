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

# 0. 把版本号写入构建元数据，避免真机运行时依赖 manifest 权限/路径
echo "[0/6] 写入构建元数据 ..."
echo "{\"version\":\"$VERSION\"}" > "$APP_SRC/server/modules/build-meta.json"

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

# 3. 打包 app.tgz (server + ui + bin)
echo "[3/6] 打包 app.tgz ..."
cd "$APP_SRC"
# 验证 ttyd 二进制存在
if [ ! -x "$APP_SRC/bin/ttyd" ]; then
  echo -e "${RED}ERROR: $APP_SRC/bin/ttyd 不存在或不可执行，无法打包${NC}"
  exit 1
fi
tar czf "$BUILD_DIR/app.tgz" --exclude='*.bak' server ui bin
cd "$PROJ_DIR"

# 4. 计算 checksum
echo "[4/6] 计算 checksum ..."
CHECKSUM=$(md5sum "$BUILD_DIR/app.tgz" | awk '{print $1}')
echo "  checksum = $CHECKSUM"

# 5. 复制文件到 build 目录
echo "[5/6] 复制文件 ..."
cp "$PROJ_DIR/manifest" "$BUILD_DIR/"
cp "$PROJ_DIR/ICON.PNG" "$BUILD_DIR/"
cp "$PROJ_DIR/ICON_256.PNG" "$BUILD_DIR/"
cp -a "$PROJ_DIR/cmd" "$BUILD_DIR/"
cp -a "$PROJ_DIR/config" "$BUILD_DIR/"
cp -a "$PROJ_DIR/wizard" "$BUILD_DIR/"

# 更新 manifest 中的 checksum
sed -i "s/^checksum.*/checksum              = $CHECKSUM/" "$BUILD_DIR/manifest"

# 6. 打包 fpk
echo "[6/6] 打包 fpk ..."
cd "$BUILD_DIR"
tar czf "$OUTPUT" manifest ICON.PNG ICON_256.PNG app.tgz cmd config wizard
cd "$PROJ_DIR"

# 验证
echo ""
echo -e "${GREEN}===== 打包完成 =====${NC}"
echo "输出: $OUTPUT"
ls -lh "$OUTPUT"
echo ""
echo "fpk 内容:"
tar tzf "$OUTPUT"
