// 前端 API 类型
// 注意：请与项目根目录 shared/api-types.ts 保持同步

export interface VersionInfo {
  panel: string
  hermes: string
  dashboard: string
  venv: string
  dataDir: string
}

export interface HealthResponse {
  ok: true
  time: string
  hermesInstalled: boolean
  hermesInstalling: boolean
  venv: string
  bin: string
  gatewayRunning: boolean
  gatewayPid: number | null
  gatewayUptime: string | null
  dashboardRunning: boolean
  dashboardPid: number | null
  dashboardUptime: string | null
  dashboardPort: number
  ttydRunning: boolean
  ttydPid: number | null
  ttydUptime: string | null
  ttydPort: number | null
  dashboardInsecure: boolean
  version: VersionInfo
}

export interface GatewayStatus {
  running: boolean
  pid?: number
  version?: VersionInfo
}

export interface DashboardStatus {
  running: boolean
  pid?: number
  uptime?: string
  port?: number
}

export interface HermesInstallStatus {
  installed: boolean
  installing: boolean
  venv: string
  bin: string
}

export interface VersionsResponse {
  ok?: boolean
  installed: boolean
  current: string | null
  currentRaw?: string
  latest: string | null
  releaseUrl?: string | null
  hasUpdate: boolean
  error?: string | null
}

export interface UpgradeStartResponse {
  ok: boolean
  message?: string
  error?: string
  currentVersion?: string
  raw?: string
  backupPath?: string
}

export interface UpgradeProgressResponse {
  inProgress: boolean
}

export interface UpgradeLogsResponse {
  logs: string[]
}

export interface OperationResult {
  ok: boolean
  message?: string
  error?: string
  pid?: number
  port?: number
  bin?: string
}

export interface ConfigPayload {
  yaml?: string
  env?: string
}

export interface ConfigResponse {
  yaml: string
  env: string
  exists: boolean
}

export interface ChannelInfo {
  [field: string]: string | boolean
  _configured: boolean
}

export interface ChannelMap {
  [key: string]: ChannelInfo
}

export interface ChannelsResponse {
  ok: boolean
  channels: ChannelMap
  supported: string[]
}

export interface LogResponse {
  lines: string[]
}

export interface TerminalStatus {
  running: boolean
  pid?: number
  port?: number
  uptime?: string
  ttyd_available: boolean
  commands: string[]
}
