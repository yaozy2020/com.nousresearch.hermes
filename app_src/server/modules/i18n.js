// @bun
// 极简 i18n：当前只支持 zh-CN，运行时显式 utf-8 加载 JSON。
// 目的：让 diagnostics 等关键文案不依赖源文件中文字面量（绕开 fnOS bun
// utf-8 源解码差异），同时为未来英文版打基础。
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const I18N_DIR = join(__dirname, "i18n");
const FALLBACK_LOCALE = "zh-CN";

let _dict = null;
let _locale = FALLBACK_LOCALE;

function loadLocale(locale) {
  const f = join(I18N_DIR, `${locale}.json`);
  if (!existsSync(f)) return null;
  try {
    const txt = readFileSync(f, "utf-8");
    return JSON.parse(txt);
  } catch (e) {
    return null;
  }
}

export function initI18n(locale) {
  _locale = locale || FALLBACK_LOCALE;
  _dict = loadLocale(_locale) || loadLocale(FALLBACK_LOCALE) || {};
}

// 取 key 对应文案，可选变量插值 {name}
export function t(key, vars) {
  if (_dict === null) initI18n();
  let s = _dict[key];
  if (s == null) return key;
  if (vars && typeof vars === "object") {
    s = s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
  }
  return s;
}

export function getLocale() { return _locale; }
