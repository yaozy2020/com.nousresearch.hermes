// E4: integration smoke test — spin up Bun.serve on a unix socket and hit /api/diagnostics + /api/providers/presets.
// Skipped automatically on environments without `bun` binary (CI Linux runners do install bun).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";

function bunAvailable() {
  try {
    const r = spawnSync("bun", ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    return r.status === 0;
  } catch {
    return false;
  }
}

const SOCKET = join(tmpdir(), `hermes-test-${process.pid}.sock`);
const DATA = mkdtempSync(join(tmpdir(), "hermes-test-data-"));

let serverProc = null;

async function fetchUnix(path, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      socketPath: SOCKET,
      path,
      method,
      headers: { Host: "localhost" },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf-8") });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function waitForSocket(timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(SOCKET)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

describe("integration · /api/diagnostics + /api/providers/presets", { skip: !bunAvailable() && "bun runtime not available" }, () => {
  before(async () => {
    serverProc = spawn("bun", ["app_src/server/index.js"], {
      env: {
        ...process.env,
        SOCKET_PATH: SOCKET,
        HERMES_DATA_DIR: DATA,
        HERMES_HOME: `${DATA}/home`,
        STATIC_DIR: "./app_src/ui",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    serverProc.stderr?.on("data", () => { /* drain */ });
    serverProc.stdout?.on("data", () => { /* drain */ });
    const ok = await waitForSocket();
    assert.ok(ok, "server failed to bind unix socket");
  });

  after(() => {
    if (serverProc && !serverProc.killed) {
      try { serverProc.kill("SIGTERM"); } catch {}
    }
    try { rmSync(SOCKET, { force: true }); } catch {}
    try { rmSync(DATA, { recursive: true, force: true }); } catch {}
  });

  it("GET /api/health returns ok", async () => {
    const r = await fetchUnix("/api/health");
    assert.equal(r.status, 200);
    const data = JSON.parse(r.body);
    assert.equal(data.ok, true);
    assert.ok(typeof data.version === "string");
  });

  it("GET /api/providers/presets returns built-in presets", async () => {
    const r = await fetchUnix("/api/providers/presets");
    assert.equal(r.status, 200);
    const data = JSON.parse(r.body);
    assert.equal(data.ok, true);
    assert.ok(Array.isArray(data.presets));
    assert.ok(data.presets.length >= 5);
    assert.equal(data.source, "builtin");
  });

  it("GET /api/diagnostics returns checks summary", async () => {
    const r = await fetchUnix("/api/diagnostics");
    assert.equal(r.status, 200);
    const data = JSON.parse(r.body);
    assert.equal(data.ok, true);
    assert.ok(data.summary);
    assert.ok(Array.isArray(data.checks));
    // 至少检测了 6 项
    assert.ok(data.checks.length >= 6, `expected >=6 checks, got ${data.checks.length}`);
    // 每项包含必备字段
    for (const c of data.checks) {
      assert.ok(typeof c.id === "string");
      assert.ok(["ok", "warn", "error"].includes(c.status));
    }
  });
});
