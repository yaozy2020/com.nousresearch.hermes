#!/usr/bin/env bun
// @bun
// \u53d7\u9650\u7ec8\u7aef\u547d\u4ee4\u5305\u88c5\u5668 \u2014\u2014 \u4ec5\u5141\u8bb8\u6267\u884c\u767d\u540d\u5355 hermes \u5b50\u547d\u4ee4
// \u7531 ttyd \u542f\u52a8\u672c\u811a\u672c\uff0c\u672c\u811a\u672c\u518d\u542f\u52a8\u771f\u6b63\u7684 hermes \u547d\u4ee4

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
    return { ok: false, error: "\u4ea4\u4e92\u5f0f shell \u5df2\u7981\u7528\u3002\u8bf7\u4ece\u9762\u677f\u9009\u62e9\u5141\u8bb8\u7684\u547d\u4ee4\u3002" };
  }

  const raw = args.join(" ");
  if (SHELL_METACHARS_RE.test(raw)) {
    return { ok: false, error: `\u547d\u4ee4\u5305\u542b\u975e\u6cd5\u5b57\u7b26\uff0c\u5df2\u62d2\u7edd\uff1a${raw}` };
  }

  if (args[0] !== "hermes") {
    return { ok: false, error: `\u53ea\u5141\u8bb8\u6267\u884c hermes \u547d\u4ee4\uff0c\u5df2\u62d2\u7edd\uff1a${args[0]}` };
  }

  const subArgs = args.slice(1);
  const cmdKey = subArgs[0];

  if (!ALLOWED_COMMANDS.has(cmdKey)) {
    return { ok: false, error: `hermes ${cmdKey} \u4e0d\u5728\u5141\u8bb8\u5217\u8868\u4e2d\u3002` };
  }

  const expected = ALLOWED_COMMANDS.get(cmdKey);
  if (subArgs.length !== expected.length) {
    return { ok: false, error: `\u547d\u4ee4\u53c2\u6570\u4e0d\u5339\u914d\u3002\u53ea\u5141\u8bb8\uff1ahermes ${expected.join(" ")}` };
  }

  for (let i = 0; i < expected.length; i++) {
    if (subArgs[i] !== expected[i]) {
      return { ok: false, error: `\u547d\u4ee4\u53c2\u6570\u4e0d\u5339\u914d\u3002\u53ea\u5141\u8bb8\uff1ahermes ${expected.join(" ")}` };
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

  // \u4f7f\u7528 spawn + detached \u521b\u5efa\u65b0\u8fdb\u7a0b\u7ec4\uff0c\u4fbf\u4e8e SIGINT \u8f6c\u53d1
  const child = spawn(hermesBin, result.command.slice(1), {
    stdio: "inherit",
    env: process.env,
    cwd,
    shell: false,
    detached: true,
  });

  // \u8f6c\u53d1 SIGINT/SIGTERM \u7ed9\u5b50\u8fdb\u7a0b\uff0c\u8ba9 Ctrl+C \u80fd\u4e2d\u65ad hermes
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
    printError(`\u542f\u52a8\u5931\u8d25\uff1a${err.message}`);
    process.exit(1);
  });
}

if (import.meta.main || (process.argv[1] && process.argv[1].endsWith("terminal-shell.js"))) {
  main();
}
