// hermes/paths.js
// 路径常量与 HERMES_BIN/HERMES_HOME 等关键位置 — 单一真相源
const DATA_DIR = process.env.HERMES_DATA_DIR || "/var/apps/com.nousresearch.hermes/home/data";
const VENV_DIR = process.env.HERMES_VENV || `${DATA_DIR}/venv`;
const HERMES_BIN = process.env.HERMES_BIN || `${VENV_DIR}/bin/hermes`;
const LOG_DIR = `${DATA_DIR}/logs`;
const RUNTIME_DIR = `${DATA_DIR}/runtime`;
const PID_FILE = `${RUNTIME_DIR}/gateway.pid`;
const DASHBOARD_PID_FILE = `${RUNTIME_DIR}/dashboard.pid`;
const HERMES_HOME = process.env.HERMES_HOME || `${DATA_DIR}/home`;
const ENV_FILE = `${HERMES_HOME}/.env`;

export {
  DATA_DIR,
  VENV_DIR,
  HERMES_BIN,
  LOG_DIR,
  RUNTIME_DIR,
  PID_FILE,
  DASHBOARD_PID_FILE,
  HERMES_HOME,
  ENV_FILE,
};
