// @bun
// 版本信息读取
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const DATA_DIR = process.env.HERMES_DATA_DIR || "/var/apps/com.nousresearch.hermes/home/data";
const VENV_DIR = process.env.HERMES_VENV || `${DATA_DIR}/venv`;
const HERMES_BIN = process.env.HERMES_BIN || `${VENV_DIR}/bin/hermes`;

export function readPanelVersion() {
  const candidates = [
    join(import.meta.dir, "..", "..", "config", "hermes-version.env"),
    join(import.meta.dir, "..", "..", "config", "prompts", "SOUL.md"),
    "/var/packages/com.nousresearch.hermes/target/config/hermes-version.env"
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      const text = readFileSync(p, "utf-8");
      const m = text.match(/PANEL_VERSION\s*=\s*([0-9]+(?:\.[0-9]+)*)/);
      if (m) return m[1];
    }
  }
  try {
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "..", "manifest"), "utf-8"));
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
}

export const PANEL_VERSION = readPanelVersion();

export function readAgentVersion() {
  if (!existsSync(HERMES_BIN)) return null;
  try {
    const proc = Bun.spawn([HERMES_BIN, "--version"], { stdout: "pipe", stderr: "pipe" });
    return new Response(proc.stdout).text().then((t) => t.trim() || null);
  } catch {
    return null;
  }
}

export function getVersion() {
  return {
    panel: PANEL_VERSION,
    hermes: existsSync(HERMES_BIN) ? "installed" : "not installed"
  };
}
