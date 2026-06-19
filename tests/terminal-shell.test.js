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
    assert.match(result.error, /交互式 shell/);
  });

  it("rejects non-hermes commands", () => {
    const result = validateCommand(["rm", "-rf", "/"]);
    assert.equal(result.ok, false);
    assert.match(result.error, /只允许执行 hermes/);
  });

  it("rejects shell metacharacters", () => {
    for (const ch of [";", "|", "&", "$", "`", "\\", "(", ")", "{", "}", "<", ">"]) {
      const result = validateCommand(["hermes", "status" + ch]);
      assert.equal(result.ok, false);
      assert.match(result.error, /非法字符/);
    }
  });

  it("rejects disallowed subcommand", () => {
    const result = validateCommand(["hermes", "eval"]);
    assert.equal(result.ok, false);
    assert.match(result.error, /不在允许列表/);
  });

  it("rejects argument length mismatch", () => {
    const result = validateCommand(["hermes", "gateway"]);
    assert.equal(result.ok, false);
    assert.match(result.error, /参数不匹配/);
  });

  it("matches SHELL_METACHARS_RE for known dangerous chars", () => {
    assert.equal(SHELL_METACHARS_RE.test(";"), true);
    assert.equal(SHELL_METACHARS_RE.test("|"), true);
    assert.equal(SHELL_METACHARS_RE.test("status"), false);
  });
});
