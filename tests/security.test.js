import { describe, it } from "node:test";
import assert from "node:assert";
import { isSafeWriteRequest, getTrustedHosts } from "../app_src/server/modules/security.js";

function makeReq(method, url, headers = {}) {
  return {
    method,
    url,
    headers: {
      get(name) {
        return headers[name.toLowerCase()] || null;
      }
    }
  };
}

describe("security / CSRF", () => {
  it("allows GET without origin", () => {
    assert.strictEqual(isSafeWriteRequest(makeReq("GET", "http://nas.local/api/health")), true);
  });

  it("allows same-origin POST", () => {
    const req = makeReq("POST", "http://nas.local/api/gateway/start", {
      origin: "http://nas.local"
    });
    assert.strictEqual(isSafeWriteRequest(req), true);
  });

  it("allows same-origin referer when origin missing", () => {
    const req = makeReq("POST", "http://nas.local/api/gateway/start", {
      referer: "http://nas.local/app/com-nousresearch-hermes"
    });
    assert.strictEqual(isSafeWriteRequest(req), true);
  });

  it("rejects third-party origin", () => {
    const req = makeReq("POST", "http://nas.local/api/gateway/start", {
      origin: "https://evil.com"
    });
    assert.strictEqual(isSafeWriteRequest(req), false);
  });

  it("rejects third-party referer with app path prefix", () => {
    const req = makeReq("POST", "http://nas.local/api/gateway/start", {
      referer: "https://evil.com/app/com-nousresearch-hermes"
    });
    assert.strictEqual(isSafeWriteRequest(req), false);
  });

  it("allows same host with different ports", () => {
    const req = {
      method: "POST",
      url: "http://localhost/api/gateway/start",
      headers: {
        get(name) {
          const map = {
            host: "192.168.10.236",
            origin: "http://192.168.10.236:5666"
          };
          return map[name.toLowerCase()] || null;
        }
      }
    };
    assert.strictEqual(isSafeWriteRequest(req), true);
  });

  it("rejects private IP origin when req Host is internal socket name", () => {
    const req = {
      method: "POST",
      url: "http://com.nousresearch.hermes/api/gateway/start",
      headers: {
        get(name) {
          const map = {
            host: "com.nousresearch.hermes",
            origin: "http://192.168.10.236"
          };
          return map[name.toLowerCase()] || null;
        }
      }
    };
    assert.strictEqual(isSafeWriteRequest(req), false);
  });

  it("prefers Host header over req.url when checking origin", () => {
    const req = {
      method: "POST",
      url: "http://localhost/api/gateway/start",
      headers: {
        get(name) {
          const map = {
            host: "192.168.10.236",
            origin: "http://192.168.10.236"
          };
          return map[name.toLowerCase()] || null;
        }
      }
    };
    assert.strictEqual(isSafeWriteRequest(req), true);
  });

  it("allows private IP origin when req Host is localhost", () => {
    const req = {
      method: "POST",
      url: "http://localhost/api/gateway/start",
      headers: {
        get(name) {
          const map = {
            host: "localhost",
            origin: "http://192.168.10.236"
          };
          return map[name.toLowerCase()] || null;
        }
      }
    };
    assert.strictEqual(isSafeWriteRequest(req), true);
  });

  it("rejects public origin even when req Host is localhost", () => {
    const req = {
      method: "POST",
      url: "http://localhost/api/gateway/start",
      headers: {
        get(name) {
          const map = {
            host: "localhost",
            origin: "https://evil.com"
          };
          return map[name.toLowerCase()] || null;
        }
      }
    };
    assert.strictEqual(isSafeWriteRequest(req), false);
  });

  it("rejects private IP origin when req Host is public domain", () => {
    const req = {
      method: "POST",
      url: "http://hermes.example.com/api/gateway/start",
      headers: {
        get(name) {
          const map = {
            host: "hermes.example.com",
            origin: "http://192.168.10.236"
          };
          return map[name.toLowerCase()] || null;
        }
      }
    };
    assert.strictEqual(isSafeWriteRequest(req), false);
  });

  it("allows HERMES_TRUSTED_HOSTS configured origin", () => {
    process.env.HERMES_TRUSTED_HOSTS = "gateway.fnos.local,192.168.10.1";
    const req = makeReq("POST", "http://nas.local/api/gateway/start", {
      origin: "https://gateway.fnos.local"
    });
    assert.strictEqual(isSafeWriteRequest(req), true);
    delete process.env.HERMES_TRUSTED_HOSTS;
  });

  it("rejects Origin: null for write requests", () => {
    const req = makeReq("POST", "http://nas.local/api/gateway/start", {
      origin: "null"
    });
    assert.strictEqual(isSafeWriteRequest(req), false);
  });

  it("rejects malformed origin", () => {
    const req = makeReq("POST", "http://nas.local/api/gateway/start", {
      origin: "not a url"
    });
    assert.strictEqual(isSafeWriteRequest(req), false);
  });

  it("getTrustedHosts returns request host and env hosts lowercased", () => {
    process.env.HERMES_TRUSTED_HOSTS = "A.COM, B.COM";
    const hosts = getTrustedHosts("Nas.Local");
    assert.ok(hosts.has("nas.local"));
    assert.ok(hosts.has("a.com"));
    assert.ok(hosts.has("b.com"));
    delete process.env.HERMES_TRUSTED_HOSTS;
  });

  it("allows POST without origin from localhost", () => {
    const req = makeReq("POST", "http://192.168.10.236/api/gateway/start", {
      host: "192.168.10.236"
    });
    assert.strictEqual(isSafeWriteRequest(req), true);
  });

  it("rejects POST without origin from public IP", () => {
    const req = makeReq("POST", "http://1.2.3.4/api/gateway/start", {
      host: "1.2.3.4"
    });
    assert.strictEqual(isSafeWriteRequest(req), false);
  });

  it("allows POST without origin when API token provided", () => {
    const req = makeReq("POST", "http://1.2.3.4/api/gateway/start", {
      host: "1.2.3.4",
      authorization: "Bearer test-token-123"
    });
    assert.strictEqual(isSafeWriteRequest(req), true);
  });
});
