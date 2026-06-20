// hermes/install.js
// pip 安装 / 包名校验 / 整体重启
import { existsSync, chmodSync } from "fs";
import { broadcastLog } from "../logger.js";
import { swallowError } from "../error.js";
import { VENV_DIR, HERMES_BIN } from "./paths.js";
import { startGateway, stopGateway } from "./gateway.js";
import { startDashboard, stopDashboard } from "./dashboard.js";

const DEFAULT_PACKAGE_SPEC = "hermes-agent";
const OFFICIAL_GIT_SPEC = "git+https://github.com/NousResearch/hermes.git";
const ALLOWED_PACKAGE_SPECS = new Set([DEFAULT_PACKAGE_SPEC, OFFICIAL_GIT_SPEC]);

let installInProgress = false;

export function isInstallInProgress() {
  return installInProgress;
}

// 校验 pip 包规格：默认只允许官方 PyPI 包或官方 Git 源。
// HERMES_ALLOW_CUSTOM_PACKAGE=1 时允许用户自定义 PyPI/Git 源，
// 但仍禁止 shell 元字符、file://、-- 选项等危险内容。
export function validatePackageSpec(packageSpec) {
  if (!packageSpec || typeof packageSpec !== "string") {
    return { ok: false, error: "packageSpec is required" };
  }
  if (packageSpec.length > 200) {
    return { ok: false, error: "packageSpec too long" };
  }

  if (ALLOWED_PACKAGE_SPECS.has(packageSpec.trim())) {
    return { ok: true };
  }

  if (process.env.HERMES_ALLOW_CUSTOM_PACKAGE !== "1") {
    return { ok: false, error: "Custom package source is not allowed. Use hermes-agent or enable HERMES_ALLOW_CUSTOM_PACKAGE=1." };
  }

  const spec = packageSpec.trim();

  if (/[;|&$(){}\`'"\s]/.test(spec)) {
    return { ok: false, error: "packageSpec contains disallowed characters" };
  }
  if (spec.startsWith("-") || spec.includes("--")) {
    return { ok: false, error: "packageSpec must not contain pip option flags" };
  }
  if (/^(file|http|https|ftp|s3):/i.test(spec)) {
    return { ok: false, error: "packageSpec must not contain arbitrary URLs" };
  }

  const pypiRe = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\[[A-Za-z0-9_,.-]+\])?(?:\s*(?:==|>=|<=|~=|!=|>|<)\s*[A-Za-z0-9._*+!-]+(?:\s*,\s*(?:==|>=|<=|~=|!=|>|<)\s*[A-Za-z0-9._*+!-]+)*)?$/;
  const gitRe = /^git\+https:\/\/[A-Za-z0-9._/-]+\/[A-Za-z0-9._/-]+(?:\.git)?(?:@[A-Za-z0-9._-]+)?$/;

  if (pypiRe.test(spec) || gitRe.test(spec)) {
    return { ok: true };
  }

  return { ok: false, error: "packageSpec format not allowed" };
}

function getPipIndexArgs() {
  const indexUrl = process.env.PIP_INDEX_URL || "https://pypi.tuna.tsinghua.edu.cn/simple";
  const args = ["-i", indexUrl];
  try {
    const u = new URL(indexUrl);
    if (u.hostname) args.push("--trusted-host", u.hostname);
  } catch (err) {
    swallowError("parse PIP_INDEX_URL", err);
  }
  return args;
}

export async function installHermes(packageSpec) {
  if (installInProgress) return { ok: false, error: "Installation already in progress" };
  if (existsSync(HERMES_BIN)) return { ok: true, message: "already installed", bin: HERMES_BIN };

  const resolvedSpec = packageSpec || DEFAULT_PACKAGE_SPEC;
  const validation = validatePackageSpec(resolvedSpec);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  installInProgress = true;
  broadcastLog("[install] Starting Hermes installation ...\n");
  try {
    let pythonBin = null;
    for (const py of ["python3.12", "python3.11", "python3.10", "python3"]) {
      try {
        const proc = Bun.spawn([py, "--version"], { stdout: "pipe", stderr: "pipe" });
        const exitCode2 = await proc.exited;
        if (exitCode2 === 0) { pythonBin = py; break; }
      } catch (err) {
        swallowError(`python probe ${py}`, err);
      }
    }
    if (!pythonBin) { installInProgress = false; return { ok: false, error: "Python 3.10+ not found" }; }
    broadcastLog(`[install] Using ${pythonBin}\n`);
    if (!existsSync(`${VENV_DIR}/bin/python`)) {
      broadcastLog("[install] Creating virtualenv ...\n");
      const venvProc = Bun.spawn([pythonBin, "-m", "venv", VENV_DIR], { stdout: "pipe", stderr: "pipe" });
      await venvProc.exited;
    }
    const pip = `${VENV_DIR}/bin/pip`;
    const pipIndexArgs = getPipIndexArgs();
    broadcastLog(`[install] Using pip index: ${pipIndexArgs[1]}\n`);
    broadcastLog("[install] Upgrading pip ...\n");
    const upgradeProc = Bun.spawn([pip, "install", "--upgrade", "pip", "wheel", "setuptools", "-q", ...pipIndexArgs], { stdout: "pipe", stderr: "pipe" });
    await upgradeProc.exited;
    broadcastLog(`[install] Installing ${resolvedSpec} ...\n`);
    const installProc = Bun.spawn([pip, "install", resolvedSpec, "-q", ...pipIndexArgs], { stdout: "pipe", stderr: "pipe" });
    (async () => {
      const reader = installProc.stderr.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          broadcastLog(new TextDecoder().decode(value));
        }
      } catch (err) {
        swallowError("install stderr reader", err);
      }
    })();
    const exitCode = await installProc.exited;
    if (exitCode !== 0) {
      // v0.31: 默认禁用 GitHub fallback（更安全），需 HERMES_ALLOW_GH_FALLBACK=1 显式开启。
      // 旧 HERMES_NO_FALLBACK=1 仍兼容（且优先生效）。
      const noFallback =
        process.env.HERMES_NO_FALLBACK === "1" ||
        process.env.HERMES_ALLOW_GH_FALLBACK !== "1";
      if (noFallback) {
        broadcastLog(`[install] ❌ pip install failed (exit ${exitCode}). GitHub fallback disabled (set HERMES_ALLOW_GH_FALLBACK=1 to enable).\n`);
        installInProgress = false;
        return { ok: false, error: `pip install failed (exit ${exitCode}). Fallback disabled.` };
      }
      broadcastLog(`[install] ⚠️ pip install failed (exit ${exitCode}). Falling back to GitHub: ${OFFICIAL_GIT_SPEC}\n`);
      broadcastLog(`[install]    HERMES_ALLOW_GH_FALLBACK=1 detected; allowing fallback this run.\n`);
      const ghProc = Bun.spawn([pip, "install", OFFICIAL_GIT_SPEC, "-q"], { stdout: "pipe", stderr: "pipe" });
      const ghExit = await ghProc.exited;
      if (ghExit !== 0) { installInProgress = false; return { ok: false, error: `pip install failed (exit ${exitCode}, github ${ghExit})` }; }
      broadcastLog(`[install] ✓ GitHub fallback succeeded.\n`);
    }
    if (!existsSync(HERMES_BIN)) { installInProgress = false; return { ok: false, error: "hermes binary not found after install" }; }
    try { chmodSync(HERMES_BIN, 0o755); } catch (err) {
      swallowError("chmod hermes binary", err);
    }
    broadcastLog("[install] Hermes installed successfully.\n");
    installInProgress = false;
    return { ok: true, message: "installed", bin: HERMES_BIN };
  } catch (err) {
    installInProgress = false;
    return { ok: false, error: String(err) };
  }
}

export async function restartHermesAll() {
  broadcastLog("[restart] Stopping all Hermes services ...\n");
  const gwStop = await stopGateway();
  const dbStop = await stopDashboard();
  await new Promise((r) => setTimeout(r, 1000));
  broadcastLog("[restart] Starting gateway ...\n");
  const gwStart = await startGateway();
  await new Promise((r) => setTimeout(r, 1500));
  broadcastLog("[restart] Starting dashboard ...\n");
  const dbStart = await startDashboard();
  return { ok: gwStart.ok && dbStart.ok, gateway: gwStart, dashboard: dbStart, stopped: { gateway: gwStop, dashboard: dbStart } };
}
