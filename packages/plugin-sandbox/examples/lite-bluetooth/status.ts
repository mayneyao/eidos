export type Phase =
  | "idle"
  | "selecting"
  | "connecting"
  | "services"
  | "reading"
  | "connected"
  | "disconnected"
  | "failed"
  | "stopped"
export interface BatteryState {
  phase: Phase
  id: string | null
  name: string | null
  percent: number | null
  error: string | null
}
export const labels: Record<Phase, string> = {
  idle: "尚未连接",
  selecting: "正在选择设备",
  connecting: "正在连接设备",
  services: "正在检查电量服务",
  reading: "正在读取电量",
  connected: "已连接",
  disconnected: "连接已断开",
  failed: "连接未完成",
  stopped: "已断开并停止后台",
}
export function parseState(value: unknown): BatteryState {
  if (!value || typeof value !== "object") throw new Error("后台返回了无效状态")
  const v = value as Record<string, unknown>
  const phase =
    typeof v.phase === "string" && v.phase in labels
      ? (v.phase as Phase)
      : "idle"
  return {
    phase: v.ok === false ? "failed" : phase,
    id: typeof v.id === "string" ? v.id : null,
    name: typeof v.name === "string" ? v.name : null,
    percent: typeof v.percent === "number" ? v.percent : null,
    error: typeof v.error === "string" ? v.error : null,
  }
}
