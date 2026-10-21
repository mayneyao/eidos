import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

/**
 * Device grants bind to the machine, not just the copied Eidos profile. The
 * raw machine identifier never leaves this process: only its salted hash is
 * sent to the account service. Platforms without a stable machine identifier
 * fall back to the profile identity.
 */
export async function resolveSparkHardwareId(
  fallback: () => Promise<string>,
  platform: NodeJS.Platform = process.platform,
  run: typeof execFileAsync = execFileAsync,
  read: typeof fs.readFile = fs.readFile
): Promise<string> {
  const machineId = await platformMachineId(platform, run, read).catch(
    () => null
  )
  return machineId
    ? createHash("sha256")
        .update(`eidos-lite-spark\0${machineId}`)
        .digest("hex")
    : fallback()
}

async function platformMachineId(
  platform: NodeJS.Platform,
  run: typeof execFileAsync,
  read: typeof fs.readFile
): Promise<string | null> {
  if (platform === "darwin") {
    const { stdout } = await run(
      "ioreg",
      ["-rd1", "-c", "IOPlatformExpertDevice"],
      { timeout: 5_000, maxBuffer: 1_000_000 }
    )
    return /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(stdout)?.[1]?.trim() || null
  }
  if (platform === "win32") {
    const { stdout } = await run(
      "reg",
      ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"],
      { timeout: 5_000, maxBuffer: 1_000_000 }
    )
    return (
      /MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{36})/.exec(stdout)?.[1]?.trim() ||
      null
    )
  }
  for (const candidate of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
    try {
      const value = (await read(candidate, "utf8")).trim()
      if (value) return value
    } catch {
      // Try the next conventional machine-id location.
    }
  }
  return null
}
