import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseBody } from "../app_src/server/modules/utils.js";

function makeReq({ text, contentType }) {
  return {
    text: async () => text,
    headers: { get: (k) => (k.toLowerCase() === "content-type" ? contentType : null) },
  };
}

describe("parseBody", () => {
  it("parses valid JSON", async () => {
    const body = await parseBody(makeReq({ text: '{"a":1}', contentType: "application/json" }));
    assert.deepEqual(body, { a: 1 });
  });

  it("throws on invalid JSON", async () => {
    await assert.rejects(
      () => parseBody(makeReq({ text: '{"a":}', contentType: "application/json" })),
      /Invalid JSON body/
    );
  });

  it("returns empty object for empty JSON body", async () => {
    const body = await parseBody(makeReq({ text: "", contentType: "application/json" }));
    assert.deepEqual(body, {});
  });

  it("parses form-urlencoded", async () => {
    const body = await parseBody(makeReq({ text: "a=1&b=2", contentType: "application/x-www-form-urlencoded" }));
    assert.deepEqual(body, { a: "1", b: "2" });
  });

  it("wraps unknown content as raw", async () => {
    const body = await parseBody(makeReq({ text: "hello", contentType: "text/plain" }));
    assert.deepEqual(body, { raw: "hello" });
  });
});
