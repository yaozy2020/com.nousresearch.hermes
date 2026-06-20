import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateCommand, ALLOWED_COMMANDS, SHELL_METACHARS_RE } from "../app_src/server/modules/terminal-shell.js";

describe("terminal-shell", () => {
  it("allows whitelisted hermes commands", () => {
    for (const [, expected] of ALLOWED_COMMANDS.entries()) {
      const result = validateCommand(["hermes", ...expected]);
      assert.equal(result.ok, true);
      assert.deepEqual(result.command, ["hermes", ...expected]);
    }
  });

  it("rejects interactive shell", () => {
    const result = validateCommand([]);
    assert.equal(result.ok, false);
    assert.match(result.error, /\u4ea4\u4e92\u5f0f shell/);
  });

  it("rejects non-hermes commands", () => {
    const result = validateCommand(["rm", "-rf", "/"]);
    assert.equal(result.ok, false);
    assert.match(result.error, /\u53ea\u5141\u8bb8\u6267\u884c hermes/);
  });

  it("rejects shell metacharacters", () => {
    for (const ch of [";", "|", "&", "$", "`", "\\", "(", ")", "{", "}", "<", ">"]) {
      const result = validateCommand(["hermes", "status" + ch]);
      assert.equal(result.ok, false);
      assert.match(result.error, /\u975e\u6cd5\u5b57\u7b26/);
    }
  });

  it("rejects disallowed subcommand", () => {
    const result = validateCommand(["hermes", "eval"]);
    assert.equal(result.ok, false);
    assert.match(result.error, /\u4e0d\u5728\u5141\u8bb8\u5217\u8868/);
  });

  it("rejects argument length mismatch", () => {
    const result = validateCommand(["hermes", "gateway"]);
    assert.equal(result.ok, false);
    assert.match(result.error, /\u53c2\u6570\u4e0d\u5339\u914d/);
  });

  it("matches SHELL_METACHARS_RE for known dangerous chars", () => {
    assert.equal(SHELL_METACHARS_RE.test(";"), true);
    assert.equal(SHELL_METACHARS_RE.test("|"), true);
    assert.equal(SHELL_METACHARS_RE.test("status"), false);
  });
});
