import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, existsSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("logger permissions", () => {
  let tmpDir;
  let logger;

  before(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "hermes-log-test-"));
    process.env.HERMES_LOG_DIR = tmpDir;
    // re-import to trigger ensureLogDir with new env
    logger = await import("../app_src/server/modules/logger.js");
  });

  after(() => {
    delete process.env.HERMES_LOG_DIR;
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("creates log dir with 0o750", () => {
    const stat = logger.getLogFileName ? undefined : undefined;
    // ensureLogDir should have created tmpDir
    assert.ok(existsSync(tmpDir));
    const { mode } = statSync(tmpDir);
    // mask out file type bits
    assert.strictEqual(mode & 0o7777, 0o750, `log dir mode should be 0o750, got ${(mode & 0o7777).toString(8)}`);
  });

  it("creates log file with 0o640 after writing", () => {
    logger.log("info", "permission test");
    const logFile = logger.getLogFileName();
    assert.ok(existsSync(logFile));
    const { mode } = statSync(logFile);
    assert.strictEqual(mode & 0o7777, 0o640, `log file mode should be 0o640, got ${(mode & 0o7777).toString(8)}`);
  });
});
