// @bun
// hermes.js — facade，重新导出 hermes/ 子模块的 API
// 拆分见：
//   - hermes/paths.js          路径常量
//   - hermes/dashboard-env.js  .env 动态读取
//   - hermes/proc-utils.js     端口/进程/uptime 工具
//   - hermes/gateway.js        Gateway 进程生命周期
//   - hermes/dashboard.js      Dashboard 进程生命周期
//   - hermes/install.js        pip 安装 / 包名校验 / 整体重启

export { initHermesModule } from "./hermes/proc-utils.js";
export { getDashboardPort, getDashboardInsecure } from "./hermes/dashboard-env.js";
export {
  isGatewayRunning,
  getGatewayPid,
  getGatewayUptime,
  startGateway,
  stopGateway,
} from "./hermes/gateway.js";
export {
  isDashboardRunning,
  getDashboardPid,
  getDashboardUptime,
  startDashboard,
  stopDashboard,
} from "./hermes/dashboard.js";
export {
  isInstallInProgress,
  validatePackageSpec,
  installHermes,
  restartHermesAll,
} from "./hermes/install.js";
