#!/usr/bin/env node
// 校验 shared/api-types.ts 与 app_src/ui-vue/src/types/api.ts 结构一致
// 只比较类型签名，忽略注释、分号、空白差异

const fs = require("fs");
const path = require("path");

const SHARED = path.join(__dirname, "..", "shared", "api-types.ts");
const FRONTEND = path.join(__dirname, "..", "app_src", "ui-vue", "src", "types", "api.ts");

function normalize(source) {
  return source
    // 移除单行注释
    .replace(/\/\/.*$/gm, "")
    // 移除多行注释
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // 移除分号
    .replace(/;/g, "")
    // 统一空白为单个空格
    .replace(/\s+/g, " ")
    .trim();
}

function main() {
  if (!fs.existsSync(SHARED)) {
    console.error(`[check-api-types] 找不到共享类型文件: ${SHARED}`);
    process.exit(1);
  }
  if (!fs.existsSync(FRONTEND)) {
    console.error(`[check-api-types] 找不到前端类型文件: ${FRONTEND}`);
    process.exit(1);
  }

  const shared = normalize(fs.readFileSync(SHARED, "utf-8"));
  const frontend = normalize(fs.readFileSync(FRONTEND, "utf-8"));

  if (shared !== frontend) {
    console.error("[check-api-types] ❌ 前后端 API 类型不一致");
    console.error(`  共享: ${SHARED}`);
    console.error(`  前端: ${FRONTEND}`);
    console.error("  请同步后再构建。");
    process.exit(1);
  }

  console.log("[check-api-types] ✅ 前后端 API 类型一致");
}

main();
