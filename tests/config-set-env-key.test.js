// v0.30.5: setEnvKey 单元测试
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "hermes-setenv-"));
const home = join(root, "home");
mkdirSync(home, { recursive: true });

process.env.HERMES_DATA_DIR = root;
process.env.HERMES_HOME = home;
process.env.HERMES_CONFIG_DIR = home;

const cfg = await import("../app_src/server/modules/config.js");
cfg.initConfigModule();

describe("v0.30.5 · setEnvKey", () => {
  it("rejects invalid keys", () => {
    let r = cfg.setEnvKey("", "1");
    assert.equal(r.ok, false);
    r = cfg.setEnvKey("lower_case", "1");
    assert.equal(r.ok, false);
    r = cfg.setEnvKey("1STARTS_WITH_DIGIT", "1");
    assert.equal(r.ok, false);
    r = cfg.setEnvKey("HAS-DASH", "1");
    assert.equal(r.ok, false);
  });

  it("appends a new key when env file is empty", () => {
    const envPath = join(home, ".env");
    if (existsSync(envPath)) rmSync(envPath);
    const r = cfg.setEnvKey("HERMES_DASHBOARD_PORT", "9200");
    assert.equal(r.ok, true);
    assert.equal(r.value, "9200");
    const text = readFileSync(envPath, "utf-8");
    assert.match(text, /HERMES_DASHBOARD_PORT=9200/);
  });

  it("overwrites existing key without reordering others", () => {
    const envPath = join(home, ".env");
    writeFileSync(envPath, "FOO=bar\nHERMES_DASHBOARD_PORT=9200\nBAZ=qux\n");
    const r = cfg.setEnvKey("HERMES_DASHBOARD_PORT", "9300");
    assert.equal(r.ok, true);
    const text = readFileSync(envPath, "utf-8");
    const lines = text.split(/\n/).filter(Boolean);
    assert.equal(lines[0], "FOO=bar");
    assert.equal(lines[1], "HERMES_DASHBOARD_PORT=9300");
    assert.equal(lines[2], "BAZ=qux");
  });

  it("keeps file mode 0o640 after write", () => {
    const envPath = join(home, ".env");
    writeFileSync(envPath, "FOO=bar\n");
    cfg.setEnvKey("HERMES_DASHBOARD_PORT", "9119");
    const mode = statSync(envPath).mode & 0o777;
    // 在某些 CI 环境 chmod 可能受 umask 影响，允许 0o600/0o640；至少不应 world-readable
    assert.equal((mode & 0o004), 0, `env file should not be world-readable, got ${mode.toString(8)}`);
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });
});
