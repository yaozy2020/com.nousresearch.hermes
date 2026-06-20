// hermes/dashboard-env.js
// 每次启动 Dashboard 前从 .env 重新读取端口与访问模式，
// 让面板内的修改不必重启整个应用就能生效。
import { existsSync, readFileSync } from "fs";
import { swallowError } from "../error.js";
import { ENV_FILE } from "./paths.js";

const INITIAL_DASHBOARD_PORT = parseInt(process.env.HERMES_DASHBOARD_PORT || "9119");

export function readDashboardEnv() {
  let port = INITIAL_DASHBOARD_PORT;
  let insecure = process.env.HERMES_DASHBOARD_INSECURE !== "0";
  if (existsSync(ENV_FILE)) {
    try {
      const text = readFileSync(ENV_FILE, "utf-8");
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq < 1) continue;
        const k = line.slice(0, eq).trim();
        const v = line.slice(eq + 1).trim();
        if (k === "HERMES_DASHBOARD_PORT") {
          const p = parseInt(v);
          if (Number.isInteger(p) && p >= 1024 && p <= 65535) port = p;
        } else if (k === "HERMES_DASHBOARD_INSECURE") {
          insecure = v !== "0";
        }
      }
    } catch (err) {
      swallowError("read .env for dashboard", err);
    }
  }
  return { port, insecure };
}

export function getDashboardPort() {
  try { return readDashboardEnv().port; } catch { return INITIAL_DASHBOARD_PORT; }
}

export function getDashboardInsecure() {
  try { return readDashboardEnv().insecure; } catch { return process.env.HERMES_DASHBOARD_INSECURE !== "0"; }
}
