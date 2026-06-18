#!/bin/bash
# Hermes FPK 打包脚本
# 用法: bash build.sh

set -e

PROJ_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_SRC="$PROJ_DIR/app_src"
BUILD_DIR="$PROJ_DIR/build"
VERSION=$(grep '^version' "$PROJ_DIR/manifest" | awk -F'=' '{print $2}' | tr -d ' ')
OUTPUT="$PROJ_DIR/com.nousresearch.hermes_v${VERSION}.fpk"

echo "===== Hermes FPK 打包 ====="

# 1. 准备 build 目录
echo "[1/5] 准备 build 目录 ..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# 2. 打包 app.tgz (server + ui + bin)
echo "[2/5] 打包 app.tgz ..."
cd "$APP_SRC"
# 验证 ttyd 二进制存在
if [ ! -x "$APP_SRC/bin/ttyd" ]; then
  echo "ERROR: $APP_SRC/bin/ttyd 不存在或不可执行，无法打包"
  exit 1
fi
tar czf "$BUILD_DIR/app.tgz" server ui bin
cd "$PROJ_DIR"

# 3. 计算 checksum
echo "[3/5] 计算 checksum ..."
CHECKSUM=$(md5sum "$BUILD_DIR/app.tgz" | awk '{print $1}')
echo "  checksum = $CHECKSUM"

# 4. 复制文件到 build 目录
echo "[4/5] 复制文件 ..."
cp "$PROJ_DIR/manifest" "$BUILD_DIR/"
cp "$PROJ_DIR/ICON.PNG" "$BUILD_DIR/"
cp "$PROJ_DIR/ICON_256.PNG" "$BUILD_DIR/"
cp -a "$PROJ_DIR/cmd" "$BUILD_DIR/"
cp -a "$PROJ_DIR/config" "$BUILD_DIR/"
cp -a "$PROJ_DIR/wizard" "$BUILD_DIR/"

# 更新 manifest 中的 checksum
sed -i "s/^checksum.*/checksum              = $CHECKSUM/" "$BUILD_DIR/manifest"

# 5. 打包 fpk
echo "[5/5] 打包 fpk ..."
cd "$BUILD_DIR"
tar czf "$OUTPUT" manifest ICON.PNG ICON_256.PNG app.tgz cmd config wizard
cd "$PROJ_DIR"

# 验证
echo ""
echo "===== 打包完成 ====="
echo "输出: $OUTPUT"
ls -lh "$OUTPUT"
echo ""
echo "fpk 内容:"
tar tzf "$OUTPUT"
