// hermes-modules.test.js — 验证 hermes.js facade 的对外 API 与 hermes/ 子模块都可加载
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 隔离测试环境
const tmp = mkdtempSync(join(tmpdir(), "hermes-modules-test-"));
process.env.HERMES_DATA_DIR = tmp;
process.env.HERMES_HOME = tmp + "/home";

const facade = await import("../app_src/server/modules/hermes.js");
const paths = await import("../app_src/server/modules/hermes/paths.js");
const dashEnv = await import("../app_src/server/modules/hermes/dashboard-env.js");
const procUtils = await import("../app_src/server/modules/hermes/proc-utils.js");
const gateway = await import("../app_src/server/modules/hermes/gateway.js");
const dashboard = await import("../app_src/server/modules/hermes/dashboard.js");
const install = await import("../app_src/server/modules/hermes/install.js");

describe("hermes facade exports", () => {
  it("exports gateway lifecycle", () => {
    assert.equal(typeof facade.isGatewayRunning, "function");
    assert.equal(typeof facade.startGateway, "function");
    assert.equal(typeof facade.stopGateway, "function");
    assert.equal(typeof facade.getGatewayPid, "function");
    assert.equal(typeof facade.getGatewayUptime, "function");
  });

  it("exports dashboard lifecycle", () => {
    assert.equal(typeof facade.isDashboardRunning, "function");
    assert.equal(typeof facade.startDashboard, "function");
    assert.equal(typeof facade.stopDashboard, "function");
    assert.equal(typeof facade.getDashboardPid, "function");
    assert.equal(typeof facade.getDashboardUptime, "function");
    assert.equal(typeof facade.getDashboardPort, "function");
    assert.equal(typeof facade.getDashboardInsecure, "function");
  });

  it("exports install api", () => {
    assert.equal(typeof facade.installHermes, "function");
    assert.equal(typeof facade.isInstallInProgress, "function");
    assert.equal(typeof facade.validatePackageSpec, "function");
    assert.equal(typeof facade.restartHermesAll, "function");
  });

  it("exports initHermesModule", () => {
    assert.equal(typeof facade.initHermesModule, "function");
  });
});

describe("hermes/paths", () => {
  it("respects HERMES_DATA_DIR override", () => {
    assert.ok(paths.DATA_DIR.length > 0);
    assert.ok(paths.HERMES_HOME.endsWith("/home"));
    assert.ok(paths.PID_FILE.endsWith("/gateway.pid"));
    assert.ok(paths.DASHBOARD_PID_FILE.endsWith("/dashboard.pid"));
    assert.ok(paths.HERMES_BIN.endsWith("/bin/hermes"));
  });
});

describe("hermes/dashboard-env", () => {
  it("returns sane defaults when .env missing", () => {
    const r = dashEnv.readDashboardEnv();
    assert.equal(typeof r.port, "number");
    assert.equal(typeof r.insecure, "boolean");
  });

  it("getter functions are stable", () => {
    assert.equal(typeof dashEnv.getDashboardPort(), "number");
    assert.equal(typeof dashEnv.getDashboardInsecure(), "boolean");
  });
});

describe("hermes/proc-utils", () => {
  it("isProcessAlive returns false for fake pid", () => {
    assert.equal(procUtils.isProcessAlive(999999999), false);
    assert.equal(procUtils.isProcessAlive(null), false);
    assert.equal(procUtils.isProcessAlive(NaN), false);
  });

  it("isProcessAlive returns true for own process", () => {
    assert.equal(procUtils.isProcessAlive(process.pid), true);
  });

  it("formatUptime formats seconds/min/hr/day", () => {
    assert.equal(procUtils.formatUptime(null), null);
    assert.equal(procUtils.formatUptime(45), "45s");
    assert.equal(procUtils.formatUptime(125), "2m");
    assert.equal(procUtils.formatUptime(3700), "1h 1m");
    assert.equal(procUtils.formatUptime(90000), "1d 1h");
  });

  it("getProcessUptime returns null for unknown pid", () => {
    assert.equal(procUtils.getProcessUptime(0), null);
    assert.equal(procUtils.getProcessUptime(99999999), null);
  });

  it("isPortInUse resolves to boolean", async () => {
    const r = await procUtils.isPortInUse(0);
    assert.equal(typeof r, "boolean");
  });
});

describe("hermes/gateway", () => {
  it("isGatewayRunning false in test env", () => {
    assert.equal(gateway.isGatewayRunning(), false);
  });
  it("getGatewayPid null in test env", () => {
    assert.equal(gateway.getGatewayPid(), null);
  });
  it("startGateway fails when binary missing", async () => {
    const r = await gateway.startGateway();
    assert.equal(r.ok, false);
    assert.ok(/binary not found/.test(r.error));
  });
});

describe("hermes/dashboard", () => {
  it("isDashboardRunning false in test env", () => {
    assert.equal(dashboard.isDashboardRunning(), false);
  });
  it("getDashboardPid null in test env", () => {
    assert.equal(dashboard.getDashboardPid(), null);
  });
});

describe("hermes/install validatePackageSpec", () => {
  it("accepts default hermes-agent", () => {
    assert.equal(install.validatePackageSpec("hermes-agent").ok, true);
  });
  it("accepts official git spec", () => {
    assert.equal(install.validatePackageSpec("git+https://github.com/NousResearch/hermes.git").ok, true);
  });
  it("rejects empty string", () => {
    assert.equal(install.validatePackageSpec("").ok, false);
    assert.equal(install.validatePackageSpec(null).ok, false);
  });
  it("rejects too long", () => {
    assert.equal(install.validatePackageSpec("a".repeat(201)).ok, false);
  });
  it("rejects custom by default", () => {
    delete process.env.HERMES_ALLOW_CUSTOM_PACKAGE;
    assert.equal(install.validatePackageSpec("foo-bar").ok, false);
  });
  it("with HERMES_ALLOW_CUSTOM_PACKAGE rejects shell metachars", () => {
    process.env.HERMES_ALLOW_CUSTOM_PACKAGE = "1";
    try {
      assert.equal(install.validatePackageSpec("foo;rm").ok, false);
      assert.equal(install.validatePackageSpec("foo bar").ok, false);
      assert.equal(install.validatePackageSpec("--flag").ok, false);
      assert.equal(install.validatePackageSpec("file:///etc").ok, false);
      assert.equal(install.validatePackageSpec("https://evil.com").ok, false);
    } finally {
      delete process.env.HERMES_ALLOW_CUSTOM_PACKAGE;
    }
  });
  it("with HERMES_ALLOW_CUSTOM_PACKAGE accepts simple PyPI spec", () => {
    process.env.HERMES_ALLOW_CUSTOM_PACKAGE = "1";
    try {
      assert.equal(install.validatePackageSpec("requests").ok, true);
      assert.equal(install.validatePackageSpec("requests==2.31.0").ok, true);
      assert.equal(install.validatePackageSpec("git+https://github.com/foo/bar.git").ok, true);
      assert.equal(install.validatePackageSpec("git+https://github.com/foo/bar.git@v1.0").ok, true);
    } finally {
      delete process.env.HERMES_ALLOW_CUSTOM_PACKAGE;
    }
  });
  it("isInstallInProgress is boolean", () => {
    assert.equal(typeof install.isInstallInProgress(), "boolean");
  });
});
