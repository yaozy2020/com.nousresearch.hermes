// @bun
// 版本信息读取
import { existsSync, readFileSync } from "fs";
import { join, resolve, dirname } from "path";

const DATA_DIR = process.env.HERMES_DATA_DIR || "/var/apps/com.nousresearch.hermes/home/data";
const VENV_DIR = process.env.HERMES_VENV || `${DATA_DIR}/venv`;
const HERMES_BIN = process.env.HERMES_BIN || `${VENV_DIR}/bin/hermes`;
const TRIM_APPDEST = process.env.TRIM_APPDEST;

function parseKeyValue(text, key) {
  const re = new RegExp(`^${key}\\s*=\\s*(.+)$`, "m");
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function* walkParents(start, depth = 6) {
  let dir = start;
  for (let i = 0; i < depth; i++) {
    yield dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

function manifestCandidates() {
  const list = new Set();

  // 从本文件所在位置向上回溯，兼容 app.tgz 内 server/modules/version.js 或 target/server/modules/version.js
  try {
    for (const dir of walkParents(import.meta.dir)) {
      list.add(resolve(dir, "manifest"));
      list.add(resolve(dir, "..", "manifest"));
    }
  } catch {}

  // 从入口脚本位置回溯
  try {
    const entry = process.argv[1] ? dirname(resolve(process.argv[1])) : null;
    if (entry) {
      for (const dir of walkParents(entry)) {
        list.add(resolve(dir, "manifest"));
      }
    }
  } catch {}

  // TRIM_APPDEST 常见布局
  if (TRIM_APPDEST) {
    list.add(resolve(TRIM_APPDEST, "manifest"));
    list.add(resolve(TRIM_APPDEST, "..", "manifest"));
    list.add(resolve(TRIM_APPDEST, "..", "..", "manifest"));
  }

  // 硬编码常见安装路径
  [
    "/var/packages/com.nousresearch.hermes/target/manifest",
    "/var/packages/com.nousresearch.hermes/manifest",
    "/vol2/@apphome/com.nousresearch.hermes/target/manifest",
    "/vol2/@apphome/com.nousresearch.hermes/manifest"
  ].forEach((p) => list.add(p));

  return Array.from(list);
}

export function findManifestPath() {
  for (const p of manifestCandidates()) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function readManifestVersion() {
  const path = findManifestPath();
  if (!path) return "unknown";
  try {
    const text = readFileSync(path, "utf-8");
    const v = parseKeyValue(text, "version");
    if (v) return v;
  } catch {}
  return "unknown";
}

function versionEnvCandidates() {
  const list = new Set([
    join(import.meta.dir, "..", "..", "config", "hermes-version.env"),
    join(import.meta.dir, "..", "..", "config", "prompts", "SOUL.md"),
    "/var/packages/com.nousresearch.hermes/target/config/hermes-version.env"
  ]);
  if (TRIM_APPDEST) {
    list.add(resolve(TRIM_APPDEST, "config", "hermes-version.env"));
    list.add(resolve(TRIM_APPDEST, "..", "config", "hermes-version.env"));
  }
  return Array.from(list);
}

export function readPanelVersion() {
  // 优先读取构建时注入的元数据，真机环境最可靠
  try {
    const metaPath = join(import.meta.dir, "build-meta.json");
    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
      if (meta.version) return meta.version;
    }
  } catch {}

  for (const p of versionEnvCandidates()) {
    if (!existsSync(p)) continue;
    try {
      const text = readFileSync(p, "utf-8");
      const m = text.match(/PANEL_VERSION\s*=\s*([0-9]+(?:\.[0-9]+)*)/);
      if (m) return m[1];
    } catch {}
  }
  return readManifestVersion();
}

export const PANEL_VERSION = readPanelVersion();

function parseHermesVersion(raw) {
  if (!raw) return null;
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
    hermes: hermes || (existsSync(HERMES_BIN) ? "installed" : "not installed"),
    dashboard: hermes || (existsSync(HERMES_BIN) ? "installed" : "not installed"),
    venv: VENV_DIR,
    dataDir: DATA_DIR
  };
}

// 导出诊断信息，便于 /api/debug/manifest 排查
export function getManifestDiagnostics() {
  return {
    candidates: manifestCandidates().map((p) => ({ path: p, exists: existsSync(p) })),
    found: findManifestPath(),
    panelVersion: PANEL_VERSION,
    env: {
      TRIM_APPDEST,
      HERMES_BIN,
      importMetaDir: import.meta.dir,
      argv1: process.argv[1]
    }
  };
}
