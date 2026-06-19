import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, existsSync, statSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

describe("cmd callbacks", () => {
  let base;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "hermes-cmd-test-"));
  });

  afterEach(() => {
    if (base && existsSync(base)) {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("install_callback creates directories with safe permissions", () => {
    const pkgHome = join(base, "home");
    const appDest = join(base, "app");
    mkdirSync(appDest, { recursive: true });

    execFileSync("bash", [join(REPO_ROOT, "cmd/install_callback")], {
      env: {
        ...process.env,
        TRIM_PKGHOME: pkgHome,
        TRIM_APPDEST: appDest,
        HERMES_DASHBOARD_PORT: "9119",
        PIP_INDEX_URL: "https://pypi.tuna.tsinghua.edu.cn/simple"
      },
      stdio: "pipe"
    });

    const dataDir = join(pkgHome, "data");
    assert.ok(existsSync(dataDir), "data dir should exist");

    const logDir = join(dataDir, "logs");
    const { mode: logMode } = statSync(logDir);
    assert.strictEqual(logMode & 0o7777, 0o750, "log dir mode should be 0o750");

    const envFile = join(dataDir, "home", ".env");
    assert.ok(existsSync(envFile), ".env should exist");
    const { mode: envMode } = statSync(envFile);
    assert.strictEqual(envMode & 0o7777, 0o640, ".env mode should be 0o640");
  });

  it("uninstall_callback refuses to wipe unsafe DATA_DIR", () => {
    const pkgHome = join(base, "home");
    const appDest = join(base, "app");
    const dataDir = join(pkgHome, "data");
    mkdirSync(join(dataDir, "home"), { recursive: true });
    mkdirSync(join(dataDir, "logs"), { recursive: true });
    writeFileSync(join(dataDir, "home", ".env"), "TEST=1\n");

    let threw = false;
    try {
      execFileSync("bash", [join(REPO_ROOT, "cmd/uninstall_callback")], {
        env: {
          ...process.env,
          TRIM_PKGHOME: pkgHome,
          TRIM_APPDEST: appDest,
          wizard_delete_data: "true"
        },
        stdio: "pipe"
      });
    } catch (err) {
      threw = true;
      // status 1 means aborted for safety
      assert.strictEqual(err.status, 1);
    }

    assert.ok(threw, "uninstall_callback should abort for unsafe DATA_DIR");
    assert.ok(existsSync(join(dataDir, "home", ".env")), ".env should be kept after abort");
  });

  it("uninstall_callback keeps data when wizard_delete_data != true", () => {
    const pkgHome = join(base, "home");
    const appDest = join(base, "app");
    const dataDir = join(pkgHome, "data");
    mkdirSync(join(dataDir, "home"), { recursive: true });
    writeFileSync(join(dataDir, "home", ".env"), "TEST=1\n");

    execFileSync("bash", [join(REPO_ROOT, "cmd/uninstall_callback")], {
      env: {
        ...process.env,
        TRIM_PKGHOME: pkgHome,
        TRIM_APPDEST: appDest,
        wizard_delete_data: "false"
      },
      stdio: "pipe"
    });

    assert.ok(existsSync(join(dataDir, "home", ".env")), ".env should be kept");
  });
});
