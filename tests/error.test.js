import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { errorResponse } from "../app_src/server/modules/error.js";

describe("error", () => {
  it("returns JSON error response with ok=false", async () => {
    const res = errorResponse("something went wrong", "ERR_CODE", 400);
    assert.equal(res.status, 400);
    assert.equal(res.headers.get("Content-Type"), "application/json");
    const body = await res.json();
    assert.deepEqual(body, { ok: false, error: "something went wrong", code: "ERR_CODE" });
  });

  it("omits code when not provided", async () => {
    const res = errorResponse("bad request");
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.deepEqual(body, { ok: false, error: "bad request" });
  });
});
