// @bun
// 配置与消息频道管理（config.yaml / .env）
import { existsSync, readFileSync, writeFileSync } from "fs";

const CONFIG_DIR = process.env.HERMES_CONFIG_DIR || `${process.env.HERMES_DATA_DIR || "/var/apps/com.nousresearch.hermes/home/data"}/config`;

// 仅暴露"纯 .env 写入即生效"的频道字段；其他频道引导用户进 Hermes Web UI
export const CHANNEL_FIELDS = {
  telegram: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_ALLOWED_USERS", "TELEGRAM_HOME_CHANNEL"],
  slack:    ["SLACK_BOT_TOKEN", "SLACK_HOME_CHANNEL"],
  discord:  ["DISCORD_BOT_TOKEN", "DISCORD_HOME_CHANNEL"],
  qqbot:    ["QQ_APP_ID", "QQBOT_TOKEN", "QQBOT_HOME_CHANNEL"],
  wecom:    ["WECOM_BOT_ID", "WECOM_HOME_CHANNEL"]
};

export function readConfig() {
  const configPath = `${CONFIG_DIR}/config.yaml`;
  const envPath = `${CONFIG_DIR}/.env`;
  const config = { yaml: "", env: "", exists: false };
  if (existsSync(configPath)) {
    config.yaml = readFileSync(configPath, "utf-8");
    config.exists = true;
  }
  if (existsSync(envPath)) {
    config.env = readFileSync(envPath, "utf-8");
  }
  return config;
}

export function writeConfig(yaml, env) {
  if (yaml !== undefined)
    writeFileSync(`${CONFIG_DIR}/config.yaml`, yaml);
  if (env !== undefined)
    writeFileSync(`${CONFIG_DIR}/.env`, env);
  return { ok: true };
}

export function parseEnvText(text) {
  const map = {};
  if (!text) return map;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    map[k] = v;
  }
  return map;
}

export function serializeEnv(map) {
  return Object.entries(map)
    .filter(([_, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n";
}

export function readChannels() {
  const envPath = `${CONFIG_DIR}/.env`;
  const text = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  const env = parseEnvText(text);
  const out = {};
  for (const [chan, fields] of Object.entries(CHANNEL_FIELDS)) {
    out[chan] = {};
    let configured = false;
    for (const f of fields) {
      out[chan][f] = env[f] || "";
      if (env[f]) configured = true;
    }
    out[chan]._configured = configured;
  }
  return out;
}

export function writeChannel(name, values) {
  if (!CHANNEL_FIELDS[name]) {
    return { ok: false, error: `unknown channel: ${name}` };
  }
  const envPath = `${CONFIG_DIR}/.env`;
  const text = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  const env = parseEnvText(text);
  const fields = CHANNEL_FIELDS[name];
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(values, f)) {
      const v = values[f];
      if (v === "" || v === null || v === undefined) {
        delete env[f];
      } else {
        env[f] = String(v);
      }
    }
  }
  writeFileSync(envPath, serializeEnv(env));
  return { ok: true, channel: name, configured: fields.some((f) => env[f]) };
}

export function deleteChannel(name) {
  if (!CHANNEL_FIELDS[name]) {
    return { ok: false, error: `unknown channel: ${name}` };
  }
  const envPath = `${CONFIG_DIR}/.env`;
  const text = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  const env = parseEnvText(text);
  for (const f of CHANNEL_FIELDS[name]) delete env[f];
  writeFileSync(envPath, serializeEnv(env));
  return { ok: true, channel: name };
}
