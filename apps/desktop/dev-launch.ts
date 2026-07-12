const DEFAULT_ELECTRON_ARGS = [".", "--no-sandbox"] as const

export function desktopDevLaunchArgs(
  remoteDebuggingPort = process.env.EIDOS_DESKTOP_REMOTE_DEBUGGING_PORT
): string[] {
  if (!remoteDebuggingPort) return [...DEFAULT_ELECTRON_ARGS]

  const port = Number(remoteDebuggingPort)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      "EIDOS_DESKTOP_REMOTE_DEBUGGING_PORT must be an integer between 1 and 65535"
    )
  }

  return [
    ...DEFAULT_ELECTRON_ARGS,
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${port}`,
  ]
}
