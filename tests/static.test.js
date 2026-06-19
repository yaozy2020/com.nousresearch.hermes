import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { serveStatic } from "../app_src/server/modules/static.js";

describe("serveStatic", () => {
  let tmpDir;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "hermes-static-"));
    writeFileSync(join(tmpDir, "index.html"), "<html></html>");
    writeFileSync(join(tmpDir, "app.js"), "console.log(1)");
    process.env.STATIC_DIR = tmpDir;
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.STATIC_DIR;
  });

  it("serves index.html at root", async () => {
    const res = serveStatic("/", tmpDir);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "text/html");
    assert.equal(await res.text(), "<html></html>");
  });

  it("serves existing files", async () => {
    const res = serveStatic("/app.js", tmpDir);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "application/javascript");
  });

  it("returns 403 for path traversal", () => {
    const res = serveStatic("/../etc/passwd", tmpDir);
    assert.equal(res.status, 403);
  });

  it("returns 403 for null byte", () => {
    const res = serveStatic("/index.html\0foo", tmpDir);
    assert.equal(res.status, 403);
  });

  it("falls back to index.html for unknown paths", async () => {
    const res = serveStatic("/not-found", tmpDir);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "text/html");
    assert.equal(await res.text(), "<html></html>");
  });

  it("returns 404 for directory paths", () => {
    mkdirSync(join(tmpDir, "subdir"));
    const res = serveStatic("/subdir", tmpDir);
    assert.equal(res.status, 404);
  });
});
