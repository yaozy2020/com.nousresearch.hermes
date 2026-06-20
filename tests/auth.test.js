// auth.test.js — API token 鉴权单测
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpHome = mkdtempSync(join(tmpdir(), "hermes-auth-test-"));
process.env.HERMES_HOME = tmpHome;
process.env.HERMES_DATA_DIR = tmpHome + "/data";
const ENV_FILE = join(tmpHome, ".env");

function writeEnv(content) {
  writeFileSync(ENV_FILE, content);
}

function fakeReq(headers = {}) {
  return {
    headers: {
      get(name) {
        return headers[name.toLowerCase()] || null;
      }
    }
  };
}

// 动态 import 必须在 env 设置后
const auth = await import("../app_src/server/modules/auth.js");

describe("auth module", () => {
  beforeEach(() => {
    if (existsSync(ENV_FILE)) unlinkSync(ENV_FILE);
  });

  it("isAuthEnabled returns false when no .env", () => {
    assert.equal(auth.isAuthEnabled(), false);
  });

  it("isAuthEnabled returns false when token line absent", () => {
    writeEnv("FOO=bar\nBAZ=qux\n");
    assert.equal(auth.isAuthEnabled(), false);
  });

  it("isAuthEnabled returns true when HERMES_API_TOKEN set", () => {
    writeEnv("HERMES_API_TOKEN=abc123\n");
    assert.equal(auth.isAuthEnabled(), true);
  });

  it("verifyRequest passes when auth disabled", () => {
    assert.equal(auth.verifyRequest(fakeReq({})), true);
  });

  it("verifyRequest rejects missing Bearer when enabled", () => {
    writeEnv("HERMES_API_TOKEN=abc\n");
    assert.equal(auth.verifyRequest(fakeReq({})), false);
  });

  it("enableAuth + verifyRequest with correct token", () => {
    const { plain } = auth.enableAuth();
    assert.equal(typeof plain, "string");
    assert.equal(plain.length, 64);
    assert.equal(auth.verifyRequest(fakeReq({ authorization: `Bearer ${plain}` })), true);
  });

  it("verifyRequest rejects wrong token", () => {
    auth.enableAuth();
    assert.equal(auth.verifyRequest(fakeReq({ authorization: "Bearer wrongtoken" })), false);
  });

  it("verifyRequest accepts X-Hermes-Token header", () => {
    const { plain } = auth.enableAuth();
    assert.equal(auth.verifyRequest(fakeReq({ "x-hermes-token": plain })), true);
  });

  it("disableAuth removes token line", () => {
    auth.enableAuth();
    assert.equal(auth.isAuthEnabled(), true);
    auth.disableAuth();
    assert.equal(auth.isAuthEnabled(), false);
  });

  it("resetToken issues new token, old one rejected", () => {
    const { plain: old } = auth.enableAuth();
    const { plain: fresh } = auth.resetToken();
    assert.notEqual(old, fresh);
    assert.equal(auth.verifyRequest(fakeReq({ authorization: `Bearer ${old}` })), false);
    assert.equal(auth.verifyRequest(fakeReq({ authorization: `Bearer ${fresh}` })), true);
  });

  it("checkResetMarker clears token + deletes marker", () => {
    auth.enableAuth();
    assert.equal(auth.isAuthEnabled(), true);
    const marker = join(tmpHome, ".reset_token");
    writeFileSync(marker, "");
    const fired = auth.checkResetMarker();
    assert.equal(fired, true);
    assert.equal(auth.isAuthEnabled(), false);
    assert.equal(existsSync(marker), false);
  });

  it("checkResetMarker no-op when file missing", () => {
    assert.equal(auth.checkResetMarker(), false);
  });

  it(".env permission is 0o600 after enableAuth", () => {
    auth.enableAuth();
    const { mode } = require("node:fs").statSync(ENV_FILE);
    // 检查 owner 之外是否无权限（mask 0o077）
    assert.equal(mode & 0o077, 0);
  });

  it("preserves other .env lines on enable/disable", () => {
    writeEnv("FOO=bar\nBAZ=qux\n");
    auth.enableAuth();
    const text = readFileSync(ENV_FILE, "utf8");
    assert.ok(text.includes("FOO=bar"));
    assert.ok(text.includes("BAZ=qux"));
    assert.ok(text.includes("HERMES_API_TOKEN="));
    auth.disableAuth();
    const text2 = readFileSync(ENV_FILE, "utf8");
    assert.ok(text2.includes("FOO=bar"));
    assert.ok(text2.includes("BAZ=qux"));
    assert.ok(!text2.includes("HERMES_API_TOKEN="));
  });
});
