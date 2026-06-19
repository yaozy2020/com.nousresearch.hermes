// @bun
// 配置与消息频道管理（config.yaml / .env）
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, chmodSync } from "fs";
import { swallowError } from "./error.js";

const DATA_DIR = process.env.HERMES_DATA_DIR || "/var/apps/com.nousresearch.hermes/home/data";
const HERMES_HOME = process.env.HERMES_HOME || `${DATA_DIR}/home`;
const CONFIG_DIR = process.env.HERMES_CONFIG_DIR || HERMES_HOME;

// Hermes 读取配置的位置是 HERMES_HOME 下的 config.yaml / .env。
// 旧版本 (< v0.23.7) 把配置写在 ${DATA_DIR}/config，导致改配置不生效；
// 启动时如果新位置没有文件而旧位置有，自动迁移一次。
if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
const LEGACY_CONFIG_DIR = `${DATA_DIR}/config`;
function migrateConfigFile(name) {
  const src = `${LEGACY_CONFIG_DIR}/${name}`;
  const dst = `${CONFIG_DIR}/${name}`;
  if (existsSync(src) && !existsSync(dst)) {
    try { copyFileSync(src, dst); } catch (err) {
      swallowError(`migrate config ${name}`, err);
    }
  }
}
migrateConfigFile("config.yaml");
migrateConfigFile(".env");

// 需要脱敏显示的敏感字段（大小写不敏感匹配）
const SENSITIVE_KEY_PATTERNS = [
  /_API_KEY$/i,
  /_TOKEN$/i,
  /_SECRET$/i,
  /_PASSWORD$/i,
  /_PRIVATE_KEY$/i,
  /_AUTH$/i,
];
const MASKED_VALUE = "__MASKED__";

export function isSensitiveKey(key) {
  return SENSITIVE_KEY_PATTERNS.some((re) => re.test(key));
}

export function maskEnvValues(text) {
  if (!text) return text;
  return text.split(/\r?\n/).map((raw) => {
    const line = raw;
    const eq = line.indexOf("=");
    if (eq < 1) return line;
    const k = line.slice(0, eq).trim();
    if (!isSensitiveKey(k)) return line;
    return `${k}=${MASKED_VALUE}`;
  }).join("\n");
}

function unmaskEnvValues(newText, oldText) {
  if (!newText) return newText;
  const oldMap = parseEnvText(oldText || "");
  const lines = newText.split(/\r?\n/);
  return lines.map((raw) => {
    const line = raw;
    const eq = line.indexOf("=");
    if (eq < 1) return line;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (isSensitiveKey(k) && v === MASKED_VALUE && oldMap[k] !== undefined) {
      return `${k}=${oldMap[k]}`;
    }
    return line;
  }).join("\n");
}

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
    // 安全：返回给前端的 .env 对敏感值脱敏
    config.env = maskEnvValues(readFileSync(envPath, "utf-8"));
  }
  return config;
}

export function writeConfig(yaml, env) {
  if (yaml !== undefined) {
    const p = `${CONFIG_DIR}/config.yaml`;
    writeFileSync(p, yaml);
    try { chmodSync(p, 0o640); } catch {}
  }
  if (env !== undefined) {
    const envPath = `${CONFIG_DIR}/.env`;
    const oldText = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
    // 安全：若前端未修改敏感字段（仍为 __MASKED__），保留原值
    const safeEnv = unmaskEnvValues(env, oldText);
    writeFileSync(envPath, safeEnv);
    try { chmodSync(envPath, 0o640); } catch {}
  }
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
      const val = env[f] || "";
      out[chan][f] = val && isSensitiveKey(f) ? MASKED_VALUE : val;
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
      let v = values[f];
      if (v === "" || v === null || v === undefined) {
        delete env[f];
      } else {
        v = String(v);
        // 安全：未修改的敏感字段保留原值
        if (isSensitiveKey(f) && v === MASKED_VALUE && env[f] !== undefined) {
          // keep old
        } else {
          env[f] = v;
        }
      }
    }
  }
  writeFileSync(envPath, serializeEnv(env));
  try { chmodSync(envPath, 0o640); } catch {}
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
  try { chmodSync(envPath, 0o640); } catch {}
  return { ok: true, channel: name };
}
