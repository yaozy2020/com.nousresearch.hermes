// hermes/upgrade.js
// hermes-agent 版本检测、升级、备份与回滚
import { existsSync, mkdirSync, cpSync, rmSync } from "fs";
import { spawn } from "child_process";
import { broadcastLog } from "../logger.js";
import { swallowError } from "../error.js";
import { DATA_DIR, HERMES_BIN } from "./paths.js";
import { stopGateway, startGateway } from "./gateway.js";
import { installHermes, validatePackageSpec } from "./install.js";

let upgradeInProgress = false;
let upgradeLogs = [];

function log(msg) {
  const line = typeof msg === "string" ? msg : String(msg);
  upgradeLogs.push(line);
  broadcastLog(line);
}

export function isUpgradeInProgress() {
  return upgradeInProgress;
}

export function getUpgradeLogs() {
  return upgradeLogs.slice();
}

export function clearUpgradeLogs() {
  upgradeLogs = [];
}

// 标准化版本号：去掉 v 前缀、trim、转小写
function normalizeVersion(v) {
  if (!v) return v;
  return String(v).trim().replace(/^v/i, "").toLowerCase();
}

// 获取当前已安装的 hermes-agent 版本（已标准化）
export async function getInstalledVersion() {
  if (!existsSync(HERMES_BIN)) return { installed: false, version: null };
  try {
    const proc = spawn(HERMES_BIN, ["--version"], { stdout: "pipe", stderr: "pipe" });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    const exitCode = await new Promise((resolve) => proc.on("close", resolve));
    if (exitCode !== 0) return { installed: true, version: null, error: stderr || "hermes --version failed" };
    const raw = stdout.trim();
    const version = normalizeVersion(raw);
    return { installed: true, version, raw };
  } catch (err) {
    return { installed: true, version: null, error: String(err) };
  }
}

// 从 PyPI 获取 hermes-agent 最新版本
export async function getLatestVersion() {
  try {
    const resp = await fetch("https://pypi.org/pypi/hermes-agent/json", {
      headers: { "Accept": "application/json" },
    });
    if (!resp.ok) throw new Error(`PyPI returned ${resp.status}`);
    const data = await resp.json();
    return { ok: true, version: data.info.version, releaseUrl: data.info.release_url };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function backupDirName() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `${DATA_DIR}/.backup/upgrade-${ts}`;
}

function restoreBackup(backupPath) {
  try {
    rmSync(DATA_DIR, { recursive: true, force: true });
    cpSync(backupPath, DATA_DIR, { recursive: true, preserveTimestamps: true });
    return true;
  } catch (err) {
    swallowError("restore backup", err);
    return false;
  }
}

// 升级 hermes-agent
// targetVersion: 可选，默认最新版
export async function upgradeHermes(targetVersion = null) {
  if (upgradeInProgress) return { ok: false, error: "Upgrade already in progress" };
  if (!existsSync(HERMES_BIN)) {
    return { ok: false, error: "Hermes is not installed yet. Please install first." };
  }

  upgradeInProgress = true;
  clearUpgradeLogs();
  const backupPath = backupDirName();

  try {
    log("[upgrade] Checking current version ...\n");
    const current = await getInstalledVersion();
    if (!current.installed || !current.version) {
      upgradeInProgress = false;
      return { ok: false, error: "Cannot detect current hermes-agent version" };
    }
    log(`[upgrade] Current version: ${current.version}\n`);

    let target = targetVersion;
    if (!target) {
      log("[upgrade] Checking latest version from PyPI ...\n");
      const latest = await getLatestVersion();
      if (!latest.ok) {
        upgradeInProgress = false;
        return { ok: false, error: `Failed to get latest version: ${latest.error}` };
      }
      target = latest.version;
      log(`[upgrade] Latest version: ${target}\n`);
    }

    const normalizedTarget = normalizeVersion(target);
    if (current.version === normalizedTarget) {
      upgradeInProgress = false;
      return { ok: true, message: "Already up to date", current: current.version, target: normalizedTarget };
    }

    const packageSpec = `hermes-agent==${normalizedTarget}`;
    const validation = validatePackageSpec(packageSpec);
    if (!validation.ok) {
      upgradeInProgress = false;
      return { ok: false, error: validation.error };
    }

    log("[upgrade] Creating backup ...\n");
    mkdirSync(`${DATA_DIR}/.backup`, { recursive: true });
    cpSync(DATA_DIR, backupPath, { recursive: true, preserveTimestamps: true });
    log(`[upgrade] Backup created at ${backupPath}\n`);

    log("[upgrade] Stopping gateway before upgrade ...\n");
    const stopResult = await stopGateway();
    if (!stopResult || !stopResult.ok) {
      log(`[upgrade] Warning: stopGateway returned ${JSON.stringify(stopResult)}\n`);
    }

    log(`[upgrade] Upgrading to ${target} ...\n`);
    const upgradeResult = await installHermes(packageSpec, { force: true });

    if (!upgradeResult || !upgradeResult.ok || !existsSync(HERMES_BIN)) {
      const reason = upgradeResult?.error || "hermes binary missing";
      log(`[upgrade] Upgrade failed: ${reason}\n`);
      log("[upgrade] Restoring backup ...\n");
      const restored = restoreBackup(backupPath);
      upgradeInProgress = false;
      if (!restored) {
        return { ok: false, error: "Upgrade failed and backup restore failed", backupPath };
      }
      log("[upgrade] Backup restored.\n");
      return { ok: false, error: `Upgrade failed: ${reason}`, backupPath };
    }

    log("[upgrade] Verifying new version ...\n");
    const after = await getInstalledVersion();
    if (!after.installed || !after.version) {
      log("[upgrade] Version verification failed, restoring backup ...\n");
      restoreBackup(backupPath);
      upgradeInProgress = false;
      return { ok: false, error: "Version verification failed after upgrade", backupPath };
    }
    log(`[upgrade] New version installed: ${after.version}\n`);

    log("[upgrade] Starting gateway ...\n");
    const startResult = await startGateway();
    if (!startResult || !startResult.ok) {
      const reason = startResult?.error || "unknown";
      log(`[upgrade] Gateway start failed: ${reason}\n`);
      log("[upgrade] Restoring backup ...\n");
      restoreBackup(backupPath);
      upgradeInProgress = false;
      return { ok: false, error: `Gateway start failed: ${reason}`, backupPath };
    }

    log("[upgrade] Upgrade completed successfully.\n");
    upgradeInProgress = false;
    return {
      ok: true,
      message: "Upgrade completed",
      previousVersion: current.version,
      currentVersion: after.version,
      target,
      backupPath,
    };
  } catch (err) {
    log(`[upgrade] Unexpected error: ${String(err)}\n`);
    if (backupPath && existsSync(backupPath)) {
      log("[upgrade] Attempting to restore backup ...\n");
      restoreBackup(backupPath);
    }
    upgradeInProgress = false;
    return { ok: false, error: String(err), backupPath };
  }
}
