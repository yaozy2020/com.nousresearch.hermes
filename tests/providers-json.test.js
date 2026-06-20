// E4: providers.json schema test — ensures the bundled file stays valid as we ship.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PROVIDERS_PATH = join(process.cwd(), "app_src/server/modules/providers.json");

describe("providers.json", () => {
  it("file exists", () => {
    assert.ok(existsSync(PROVIDERS_PATH), `providers.json missing at ${PROVIDERS_PATH}`);
  });

  it("parses as JSON", () => {
    const txt = readFileSync(PROVIDERS_PATH, "utf-8");
    JSON.parse(txt);
  });

  it("has version + presets array", () => {
    const data = JSON.parse(readFileSync(PROVIDERS_PATH, "utf-8"));
    assert.ok(typeof data.version === "number", "version should be number");
    assert.ok(Array.isArray(data.presets), "presets should be array");
    assert.ok(data.presets.length >= 5, "should ship at least 5 presets");
  });

  it("each preset has required fields and unique id", () => {
    const data = JSON.parse(readFileSync(PROVIDERS_PATH, "utf-8"));
    const seen = new Set();
    for (const p of data.presets) {
      for (const field of ["id", "name", "base_url", "tag"]) {
        assert.ok(typeof p[field] === "string" && p[field].length > 0,
          `preset missing field ${field}: ${JSON.stringify(p)}`);
      }
      assert.ok(/^https?:\/\//.test(p.base_url),
        `preset ${p.id} base_url must be http(s) URL`);
      assert.ok(typeof p.editable_url === "boolean",
        `preset ${p.id} editable_url should be boolean`);
      assert.ok(!seen.has(p.id), `duplicate preset id: ${p.id}`);
      seen.add(p.id);
    }
  });

  it("at least one China-direct preset is recommended first", () => {
    const data = JSON.parse(readFileSync(PROVIDERS_PATH, "utf-8"));
    const first = data.presets[0];
    assert.ok(first && first.tag.includes("国内"),
      `expected first preset tag to contain '国内', got: ${first?.tag}`);
  });
});
