import assert from "node:assert";
import test from "node:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 模拟 DATA_DIR，避免污染真实环境
const TEST_DATA_DIR = join(__dirname, "../tmp/hermes-upgrade-test-data");
process.env.HERMES_DATA_DIR = TEST_DATA_DIR;
process.env.HERMES_VENV = join(TEST_DATA_DIR, "venv");
process.env.HERMES_BIN = join(TEST_DATA_DIR, "venv/bin/hermes");
process.env.HERMES_HOME = join(TEST_DATA_DIR, "home");
process.env.HERMES_BUNDLED_WHEELS = join(__dirname, "../wheels");

const { getInstalledVersion, getLatestVersion, isUpgradeInProgress } = await import("../app_src/server/modules/hermes/upgrade.js");

test("getInstalledVersion returns null when not installed", async () => {
  if (existsSync(TEST_DATA_DIR)) rmSync(TEST_DATA_DIR, { recursive: true });
  const v = await getInstalledVersion();
  assert.strictEqual(v.installed, false);
  assert.strictEqual(v.version, null);
});

test("getInstalledVersion normalizes v-prefix", async () => {
  if (existsSync(TEST_DATA_DIR)) rmSync(TEST_DATA_DIR, { recursive: true });
  mkdirSync(join(TEST_DATA_DIR, "venv/bin"), { recursive: true });
  // 写一个假的 hermes 脚本返回 v0.17.0
  const bin = join(TEST_DATA_DIR, "venv/bin/hermes");
  writeFileSync(bin, '#!/bin/sh\necho "v0.17.0"\n', { mode: 0o755 });
  const v = await getInstalledVersion();
  assert.strictEqual(v.installed, true);
  assert.strictEqual(v.version, "0.17.0");
});

test("getLatestVersion fetches from PyPI", async () => {
  const v = await getLatestVersion();
  assert.strictEqual(v.ok, true);
  assert.ok(typeof v.version === "string");
  assert.ok(v.version.length > 0);
});

test("isUpgradeInProgress returns boolean", () => {
  assert.strictEqual(typeof isUpgradeInProgress(), "boolean");
});

// 清理
if (existsSync(TEST_DATA_DIR)) rmSync(TEST_DATA_DIR, { recursive: true });
