export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

export interface BluetoothPolicy {
  devices: Array<{
    id: string
    name?: string
    /** Trusted host grant for all GATT services of this specific device. */
    allServices?: boolean
    services: Array<{
      uuid: string
      read?: boolean
      write?: boolean
      notify?: boolean
    }>
  }>
}

/** Trusted host grants. Never copy an untrusted manifest directly into this object. */
export interface SandboxPermissions {
  network?: { origins: string[]; allowPrivateAddresses?: boolean }
  bluetooth?: BluetoothPolicy
}

export interface SandboxLimits {
  memoryMb?: number
  turnBudgetMs?: number
  /** Defaults to 0 for a background. The standalone CLI defaults to 30 seconds. */
  maxDurationMs?: number
}

export interface BackgroundExit {
  code: number | null
  signal: NodeJS.Signals | null
  reason: "stopped" | "exited" | "failed"
  error?: Error
}

export interface BackgroundOptions {
  /** Absolute path to a bundled JavaScript ES module. */
  entry: string
  /** Trusted native executable. Defaults to the package's bin/<platform>-<arch>. */
  binaryPath?: string
  permissions?: SandboxPermissions
  limits?: SandboxLimits
  /** Explicit hardware simulation; still enforces grants. Defaults to false. */
  bluetoothMock?: boolean
  startupTimeoutMs?: number
  stopTimeoutMs?: number
  /** Aborting also stops an already running background. */
  signal?: AbortSignal
  /** Reply can service initialization requests before the entry module is ready. */
  onMessage?: (
    message: JsonValue,
    reply: (message: JsonValue) => Promise<void>
  ) => void
  onLog?: (line: string) => void
  onError?: (error: Error) => void
  onExit?: (exit: BackgroundExit) => void
}
