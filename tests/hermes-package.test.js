import { describe, it } from "node:test";
import assert from "node:assert";
import { validatePackageSpec } from "../app_src/server/modules/hermes.js";

describe("validatePackageSpec", () => {
  it("allows default hermes-agent", () => {
    const r = validatePackageSpec("hermes-agent");
    assert.strictEqual(r.ok, true);
  });

  it("allows official git source", () => {
    const r = validatePackageSpec("git+https://github.com/NousResearch/hermes.git");
    assert.strictEqual(r.ok, true);
  });

  it("rejects empty or non-string", () => {
    assert.strictEqual(validatePackageSpec("").ok, false);
    assert.strictEqual(validatePackageSpec(null).ok, false);
    assert.strictEqual(validatePackageSpec(123).ok, false);
  });

  it("rejects custom package by default", () => {
    const r = validatePackageSpec("requests==2.32");
    assert.strictEqual(r.ok, false);
    assert.ok(r.error.includes("Custom package source is not allowed"));
  });

  it("rejects shell metacharacters", () => {
    delete process.env.HERMES_ALLOW_CUSTOM_PACKAGE;
    for (const spec of [
      "hermes-agent;id",
      "hermes-agent|id",
      "hermes-agent$(id)",
      "hermes-agent`id`",
      "hermes-agent$(whoami)",
      "hermes-agent; rm -rf /",
    ]) {
      const r = validatePackageSpec(spec);
      assert.strictEqual(r.ok, false, `expected rejection for: ${spec}`);
    }
  });

  it("rejects pip option flags", () => {
    delete process.env.HERMES_ALLOW_CUSTOM_PACKAGE;
    assert.strictEqual(validatePackageSpec("--index-url evil.com").ok, false);
    assert.strictEqual(validatePackageSpec("hermes-agent --force-reinstall").ok, false);
  });

  it("rejects arbitrary URLs", () => {
    delete process.env.HERMES_ALLOW_CUSTOM_PACKAGE;
    assert.strictEqual(validatePackageSpec("https://evil.com/package.whl").ok, false);
    assert.strictEqual(validatePackageSpec("file:///etc/passwd").ok, false);
  });

  it("allows custom PyPI spec when HERMES_ALLOW_CUSTOM_PACKAGE=1", () => {
    process.env.HERMES_ALLOW_CUSTOM_PACKAGE = "1";
    try {
      assert.strictEqual(validatePackageSpec("requests==2.32").ok, true);
      assert.strictEqual(validatePackageSpec("requests[security]>=2.0,<3.0").ok, true);
      assert.strictEqual(validatePackageSpec("numpy").ok, true);
    } finally {
      delete process.env.HERMES_ALLOW_CUSTOM_PACKAGE;
    }
  });

  it("allows custom git source when HERMES_ALLOW_CUSTOM_PACKAGE=1", () => {
    process.env.HERMES_ALLOW_CUSTOM_PACKAGE = "1";
    try {
      assert.strictEqual(validatePackageSpec("git+https://github.com/user/repo.git").ok, true);
      assert.strictEqual(validatePackageSpec("git+https://github.com/user/repo.git@v1.0").ok, true);
    } finally {
      delete process.env.HERMES_ALLOW_CUSTOM_PACKAGE;
    }
  });

  it("still rejects dangerous custom specs", () => {
    process.env.HERMES_ALLOW_CUSTOM_PACKAGE = "1";
    try {
      assert.strictEqual(validatePackageSpec("git+https://evil.com/repo.git;id").ok, false);
      assert.strictEqual(validatePackageSpec("package==1.0; rm -rf /").ok, false);
      assert.strictEqual(validatePackageSpec("file:///etc/passwd").ok, false);
    } finally {
      delete process.env.HERMES_ALLOW_CUSTOM_PACKAGE;
    }
  });
});
