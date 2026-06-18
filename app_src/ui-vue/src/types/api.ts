// 前端 API 类型
// 注意：请与项目根目录 shared/api-types.ts 保持同步

export interface VersionInfo {
  panel: string
  hermes: string
}

export interface HealthResponse {
  ok: true
  time: string
  hermesInstalled: boolean
  venv: string
  bin: string
  gatewayRunning: boolean
  gatewayPid: number | null
  dashboardRunning: boolean
  dashboardPid: number | null
  dashboardPort: number
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
  port?: number
}

export interface HermesInstallStatus {
  installed: boolean
  venv: string
  bin: string
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
  [channel: string]: ChannelInfo
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
  ttyd_available: boolean
  commands: string[]
}
