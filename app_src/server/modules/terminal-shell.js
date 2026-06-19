#!/usr/bin/env bun
// @bun
// 受限终端命令包装器 —— 仅允许执行白名单 hermes 子命令
// 由 ttyd 启动本脚本，本脚本再启动真正的 hermes 命令

import { spawn } from "child_process";

export const ALLOWED_COMMANDS = new Map([
  ["setup", ["setup"]],
  ["model", ["model"]],
  ["login", ["login"]],
  ["gateway", ["gateway", "setup"]],
  ["doctor", ["doctor"]],
  ["status", ["status"]],
]);

export const SHELL_METACHARS_RE = /[;|&$`\\(){}<>\r\n]/;

export function validateCommand(args) {
  if (!Array.isArray(args) || args.length === 0) {
    return { ok: false, error: "交互式 shell 已禁用。请从面板选择允许的命令。" };
  }

  const raw = args.join(" ");
  if (SHELL_METACHARS_RE.test(raw)) {
    return { ok: false, error: `命令包含非法字符，已拒绝：${raw}` };
  }

  if (args[0] !== "hermes") {
    return { ok: false, error: `只允许执行 hermes 命令，已拒绝：${args[0]}` };
  }

  const subArgs = args.slice(1);
  const cmdKey = subArgs[0];

  if (!ALLOWED_COMMANDS.has(cmdKey)) {
    return { ok: false, error: `hermes ${cmdKey} 不在允许列表中。` };
  }

  const expected = ALLOWED_COMMANDS.get(cmdKey);
  if (subArgs.length !== expected.length) {
    return { ok: false, error: `命令参数不匹配。只允许：hermes ${expected.join(" ")}` };
  }

  for (let i = 0; i < expected.length; i++) {
    if (subArgs[i] !== expected[i]) {
      return { ok: false, error: `命令参数不匹配。只允许：hermes ${expected.join(" ")}` };
    }
  }

  return { ok: true, command: ["hermes", ...expected] };
}

function printError(msg) {
  process.stderr.write(`\x1b[31m[hermes-shell] ${msg}\x1b[0m\r\n`);
  process.stdout.write("\r\n");
}

function main() {
  const args = process.argv.slice(2);
  const result = validateCommand(args);
  if (!result.ok) {
    printError(result.error);
    process.exit(1);
  }

  const hermesBin = process.env.HERMES_BIN || "hermes";
  const cwd = process.env.HERMES_DATA_DIR || process.cwd();

  // 使用 spawn + detached 创建新进程组，便于 SIGINT 转发
  const child = spawn(hermesBin, result.command.slice(1), {
    stdio: "inherit",
    env: process.env,
    cwd,
    shell: false,
    detached: true,
  });

  // 转发 SIGINT/SIGTERM 给子进程，让 Ctrl+C 能中断 hermes
  function forwardSignal(sig) {
    try {
      process.kill(-child.pid, sig);
    } catch {}
  }

  process.on("SIGINT", () => forwardSignal("SIGINT"));
  process.on("SIGTERM", () => forwardSignal("SIGTERM"));

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });

  child.on("error", (err) => {
    printError(`启动失败：${err.message}`);
    process.exit(1);
  });
}

if (import.meta.main || (process.argv[1] && process.argv[1].endsWith("terminal-shell.js"))) {
  main();
}
