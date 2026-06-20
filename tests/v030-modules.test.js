// v0.30: backup / providers / trust \u6a21\u5757\u5355\u5143\u6d4b\u8bd5
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "hermes-v030-"));
const dataDir = join(root, "data");
const home = join(dataDir, "home");
mkdirSync(home, { recursive: true });
writeFileSync(join(home, ".env"), "HELLO=world\n");
writeFileSync(join(home, "config.yaml"), "providers:\n  default: openai\n");

process.env.HERMES_DATA_DIR = dataDir;
process.env.HERMES_HOME = home;

const backup = await import("../app_src/server/modules/backup.js");
const providers = await import("../app_src/server/modules/providers.js");
const trust = await import("../app_src/server/modules/trust.js");

describe("v030 \u00b7 backup module", () => {
  it("creates and lists backups", () => {
    const r = backup.createBackup();
    assert.equal(r.ok, true);
    assert.match(r.id, /^backup_/);
    const list = backup.listBackups();
    assert.ok(list.length >= 1);
    assert.equal(list[0].id, r.id);
    assert.ok(list[0].size > 0);
  });

  it("restores backup", () => {
    const created = backup.createBackup();
    // \u5220\u9664 .env \u770b\u80fd\u4e0d\u80fd\u6062\u590d
    rmSync(join(home, ".env"));
    const r = backup.restoreBackup(created.id);
    assert.equal(r.ok, true);
    assert.ok(existsSync(join(home, ".env")));
    assert.match(readFileSync(join(home, ".env"), "utf-8"), /HELLO=world/);
  });

  it("rejects path traversal in id", () => {
    const r = backup.restoreBackup("../etc/passwd");
    assert.equal(r.ok, false);
  });

  it("deletes backup", () => {
    const c = backup.createBackup();
    const r = backup.deleteBackup(c.id);
    assert.equal(r.ok, true);
    assert.equal(backup.listBackups().some((b) => b.id === c.id), false);
  });

  after(() => {
    try { rmSync(root, { recursive: true, force: true }); } catch {}
  });
});

describe("v030 \u00b7 providers module", () => {
  it("returns merged providers (builtin only when user empty)", () => {
    const eff = providers.getEffectiveProviders();
    assert.ok(eff.presets.length >= 5);
    assert.ok(["builtin", "merged"].includes(eff.source));
  });

  it("validates provider payload strictly", () => {
    const bad1 = providers.addUserProvider({});
    assert.equal(bad1.ok, false);
    const bad2 = providers.addUserProvider({ name: "x", label: "X", base_url: "ftp://x", env_key: "X_API_KEY" });
    assert.equal(bad2.ok, false); // base_url \u5fc5\u987b http
    const bad3 = providers.addUserProvider({ name: "x", label: "X", base_url: "https://x.com", env_key: "lower" });
    assert.equal(bad3.ok, false); // env_key \u5fc5\u987b\u5927\u5199_API_KEY
  });

  it("rejects builtin name conflict", () => {
    const eff = providers.getEffectiveProviders();
    const builtinName = eff.presets[0].name;
    const r = providers.addUserProvider({
      name: builtinName,
      label: "dup",
      base_url: "https://example.com",
      env_key: "DUP_API_KEY"
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /builtin/);
  });

  it("adds + deletes user provider", () => {
    const ok = providers.addUserProvider({
      name: "myprov",
      label: "My",
      base_url: "https://api.example.com",
      env_key: "MYPROV_API_KEY",
      docs: "https://example.com/docs"
    });
    assert.equal(ok.ok, true);
    const list = providers.getUserProviders();
    assert.ok(list.some((p) => p.name === "myprov"));
    const del = providers.deleteUserProvider("myprov");
    assert.equal(del.ok, true);
  });
});

describe("v030 \u00b7 trust module", () => {
  it("rejects invalid hash format", () => {
    const r1 = trust.addTrustedHash("not-hash");
    assert.equal(r1.ok, false);
    const r2 = trust.addTrustedHash("abc"); // \u592a\u77ed
    assert.equal(r2.ok, false);
  });

  it("adds + lists + deletes hash, normalises to lowercase", () => {
    const upper = "ABCDEF" + "0".repeat(58); // 64 hex
    const ok = trust.addTrustedHash(upper);
    assert.equal(ok.ok, true);
    const list = trust.listTrustedHashes();
    assert.ok(list.includes(upper.toLowerCase()));
    // checkTrust \u5927\u5c0f\u5199\u5747\u53ef
    assert.equal(trust.checkTrust(upper), true);
    assert.equal(trust.checkTrust(upper.toLowerCase()), true);
    assert.equal(trust.checkTrust("0".repeat(64)), false);
    const del = trust.deleteTrustedHash(upper);
    assert.equal(del.ok, true);
  });

  it("returns null when trust list is empty (= disabled)", () => {
    // \u5217\u8868\u5df2\u88ab\u524d\u4e00\u9879\u6e05\u7a7a
    assert.equal(trust.checkTrust("a".repeat(64)), null);
  });
});
