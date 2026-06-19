// @bun
// 版本信息读取
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

const DATA_DIR = process.env.HERMES_DATA_DIR || "/var/apps/com.nousresearch.hermes/home/data";
const VENV_DIR = process.env.HERMES_VENV || `${DATA_DIR}/venv`;
const HERMES_BIN = process.env.HERMES_BIN || `${VENV_DIR}/bin/hermes`;
const TRIM_APPDEST = process.env.TRIM_APPDEST;

function parseKeyValue(text, key) {
  const re = new RegExp(`^${key}\\s*=\\s*(.+)$`, "m");
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function manifestCandidates() {
  const list = [
    join(import.meta.dir, "..", "..", "manifest"),
    "/var/packages/com.nousresearch.hermes/target/manifest",
    "/var/packages/com.nousresearch.hermes/target/config/../manifest"
  ];
  if (TRIM_APPDEST) {
    list.unshift(resolve(TRIM_APPDEST, "..", "manifest"));
    list.unshift(resolve(TRIM_APPDEST, "manifest"));
  }
  return list;
}

function readManifestVersion() {
  for (const p of manifestCandidates()) {
    if (!existsSync(p)) continue;
    try {
      const text = readFileSync(p, "utf-8");
      const v = parseKeyValue(text, "version");
      if (v) return v;
    } catch {}
  }
  return "unknown";
}

export function readPanelVersion() {
  const candidates = [
    join(import.meta.dir, "..", "..", "config", "hermes-version.env"),
    join(import.meta.dir, "..", "..", "config", "prompts", "SOUL.md"),
    "/var/packages/com.nousresearch.hermes/target/config/hermes-version.env"
  ];
  if (TRIM_APPDEST) {
    candidates.unshift(resolve(TRIM_APPDEST, "config", "hermes-version.env"));
  }
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        const text = readFileSync(p, "utf-8");
        const m = text.match(/PANEL_VERSION\s*=\s*([0-9]+(?:\.[0-9]+)*)/);
        if (m) return m[1];
      } catch {}
    }
  }
  return readManifestVersion();
}

export const PANEL_VERSION = readPanelVersion();

function parseHermesVersion(raw) {
  if (!raw) return null;
  // 常见输出：
  // Hermes Agent v0.16.0
  // /vol2/@apphome/com.nousresearch.hermes/target/venv/lib/python3.11/site-packages/hermes_agent
  // Python: 3.11.4
  const m = raw.match(/(?:Hermes\s+Agent\s+)?v?([0-9]+(?:\.[0-9]+)*)/i);
  if (m) return m[1];
  const first = raw.split(/\r?\n/)[0].trim();
  return first || null;
}

export async function readAgentVersion() {
  if (!existsSync(HERMES_BIN)) return null;
  try {
    const proc = Bun.spawn([HERMES_BIN, "--version"], { stdout: "pipe", stderr: "pipe" });
    const text = await new Response(proc.stdout).text();
    return parseHermesVersion(text.trim());
  } catch {
    return null;
  }
}

export async function getVersion() {
  const hermes = await readAgentVersion();
  return {
    panel: PANEL_VERSION,
    hermes: hermes || (existsSync(HERMES_BIN) ? "installed" : "not installed")
  };
}
