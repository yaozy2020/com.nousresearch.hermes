// rate-limit.test.js
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  checkGeneralLimit,
  isAuthLocked,
  recordAuthFailure,
  recordAuthSuccess,
  _resetAll,
} from "../app_src/server/modules/rate-limit.js";

function fakeReq(ip = "10.0.0.1") {
  return {
    headers: {
      get(name) {
        if (name.toLowerCase() === "x-forwarded-for") return ip;
        return null;
      }
    }
  };
}

describe("rate-limit module", () => {
  beforeEach(() => _resetAll());

  it("checkGeneralLimit allows under threshold", () => {
    const req = fakeReq("10.0.0.2");
    for (let i = 0; i < 50; i++) {
      assert.equal(checkGeneralLimit(req), null);
    }
  });

  it("checkGeneralLimit blocks at 301st request", () => {
    const req = fakeReq("10.0.0.3");
    let last = null;
    for (let i = 0; i < 350; i++) {
      last = checkGeneralLimit(req);
      if (last) break;
    }
    assert.ok(last);
    assert.equal(last.status, 429);
  });

  it("isAuthLocked false initially", () => {
    assert.equal(isAuthLocked(fakeReq("10.0.0.4")), false);
  });

  it("recordAuthFailure does not lock under threshold", () => {
    const req = fakeReq("10.0.0.5");
    for (let i = 0; i < 4; i++) recordAuthFailure(req);
    assert.equal(isAuthLocked(req), false);
  });

  it("recordAuthFailure locks at 5 fails", () => {
    const req = fakeReq("10.0.0.6");
    for (let i = 0; i < 5; i++) recordAuthFailure(req);
    assert.equal(isAuthLocked(req), true);
  });

  it("recordAuthSuccess clears fail counter", () => {
    const req = fakeReq("10.0.0.7");
    for (let i = 0; i < 4; i++) recordAuthFailure(req);
    recordAuthSuccess(req);
    assert.equal(isAuthLocked(req), false);
    // 再失败 4 次也不应锁
    for (let i = 0; i < 4; i++) recordAuthFailure(req);
    assert.equal(isAuthLocked(req), false);
  });

  it("different IPs are isolated", () => {
    const a = fakeReq("10.0.0.8");
    const b = fakeReq("10.0.0.9");
    for (let i = 0; i < 5; i++) recordAuthFailure(a);
    assert.equal(isAuthLocked(a), true);
    assert.equal(isAuthLocked(b), false);
  });
});
