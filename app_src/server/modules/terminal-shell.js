#!/usr/bin/env bun
// @bun
// 受限终端命令包装器 —— 仅允许执行白名单 hermes 子命令
// 由 ttyd 启动本脚本，本脚本再启动真正的 hermes 命令

import { spawn } from "child_process";

const ALLOWED_COMMANDS = new Map([
  ["setup", ["setup"]],
  ["model", ["model"]],
  ["login", ["login"]],
  ["gateway", ["gateway", "setup"]],
  ["doctor", ["doctor"]],
  ["status", ["status"]],
]);

const SHELL_METACHARS_RE = /[;|&$`\\(){}<>\r\n]/;

function printError(msg) {
  process.stderr.write(`\x1b[31m[hermes-shell] ${msg}\x1b[0m\r\n`);
  process.stdout.write("\r\n");
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printError("交互式 shell 已禁用。请从面板选择允许的命令。");
    process.exit(1);
  }

  const raw = args.join(" ");

  if (SHELL_METACHARS_RE.test(raw)) {
    printError(`命令包含非法字符，已拒绝：${raw}`);
    process.exit(1);
  }

  if (args[0] !== "hermes") {
    printError(`只允许执行 hermes 命令，已拒绝：${args[0]}`);
    process.exit(1);
  }

  const subArgs = args.slice(1);
  const cmdKey = subArgs[0];

  if (!ALLOWED_COMMANDS.has(cmdKey)) {
    printError(`hermes ${cmdKey} 不在允许列表中。`);
    process.exit(1);
  }

  const expected = ALLOWED_COMMANDS.get(cmdKey);

  if (subArgs.length !== expected.length) {
    printError(`命令参数不匹配。只允许：hermes ${expected.join(" ")}`);
    process.exit(1);
  }

  for (let i = 0; i < expected.length; i++) {
    if (subArgs[i] !== expected[i]) {
      printError(`命令参数不匹配。只允许：hermes ${expected.join(" ")}`);
      process.exit(1);
    }
  }

  const hermesBin = process.env.HERMES_BIN || "hermes";
  const cwd = process.env.HERMES_DATA_DIR || process.cwd();

  // 使用 spawn + detached 创建新进程组，便于 SIGINT 转发
  const child = spawn(hermesBin, expected, {
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

main();
