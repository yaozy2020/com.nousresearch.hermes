import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { isSensitiveKey, maskEnvValues, lockDashboardConfig } from "../app_src/server/modules/config.js";

describe("config", () => {
  it("detects sensitive env keys", () => {
    assert.equal(isSensitiveKey("OPENAI_API_KEY"), true);
    assert.equal(isSensitiveKey("TELEGRAM_BOT_TOKEN"), true);
    assert.equal(isSensitiveKey("SOME_SECRET"), true);
    assert.equal(isSensitiveKey("MY_PASSWORD"), true);
    assert.equal(isSensitiveKey("AUTH"), false);
    assert.equal(isSensitiveKey("MY_AUTH"), true);
    assert.equal(isSensitiveKey("PLAIN_VAR"), false);
  });

  it("masks sensitive values but leaves plain vars", () => {
    const input = [
      "OPENAI_API_KEY=sk-12345",
      "PLAIN_VAR=hello",
      "TELEGRAM_BOT_TOKEN=abc",
      "# comment",
      "NO_EQUALS_LINE",
    ].join("\n");

    const masked = maskEnvValues(input);
    assert.match(masked, /OPENAI_API_KEY=__MASKED__/);
    assert.match(masked, /PLAIN_VAR=hello/);
    assert.match(masked, /TELEGRAM_BOT_TOKEN=__MASKED__/);
    assert.match(masked, /# comment/);
    assert.match(masked, /NO_EQUALS_LINE/);
  });

  it("returns falsy input unchanged", () => {
    assert.equal(maskEnvValues(""), "");
    assert.equal(maskEnvValues(null), null);
    assert.equal(maskEnvValues(undefined), undefined);
  });
});
