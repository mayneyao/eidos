import path from "node:path"

export type EidosHomeSource = "env" | "profile" | "default"

export interface EidosHomeInputs {
  env: NodeJS.ProcessEnv
  homeDirectory: string
  userDataPath: string
  defaultUserDataPath: string
}

export interface EidosHome {
  /** Root of user-visible, shareable Eidos state. */
  home: string
  /** Device-wide plugin store inside the home. */
  plugins: string
  source: EidosHomeSource
  /** Previous plugin location to migrate from, or null when not applicable. */
  legacyPlugins: string | null
}

/**
 * Resolve where device-wide Eidos state lives.
 *
 * Plugin state is user-visible and shared by every native host on the device,
 * so it belongs under an Eidos home rather than Electron's private userData.
 * Development and packaged-smoke profiles redirect Electron userData, and keep
 * using that isolated directory so verification never touches a real user's
 * plugins.
 */
export function resolveEidosHome(inputs: EidosHomeInputs): EidosHome {
  const explicit = inputs.env.EIDOS_HOME?.trim()
  if (explicit) {
    if (!path.isAbsolute(explicit))
      throw new Error("EIDOS_HOME must be an absolute path")
    return {
      home: explicit,
      plugins: path.join(explicit, "plugins"),
      source: "env",
      legacyPlugins: null,
    }
  }
  const isolated =
    path.resolve(inputs.userDataPath) !==
    path.resolve(inputs.defaultUserDataPath)
  if (isolated) {
    return {
      home: inputs.userDataPath,
      plugins: path.join(inputs.userDataPath, "plugins"),
      source: "profile",
      legacyPlugins: null,
    }
  }
  const home = path.join(inputs.homeDirectory, ".eidos")
  return {
    home,
    plugins: path.join(home, "plugins"),
    source: "default",
    legacyPlugins: path.join(inputs.userDataPath, "plugins"),
  }
}

export interface SyncFileSystem {
  existsSync(target: string): boolean
  mkdirSync(
    target: string,
    options: { recursive: boolean; mode?: number }
  ): void
  cpSync(
    source: string,
    target: string,
    options: { recursive: boolean; force: boolean; errorOnExist: boolean }
  ): void
  renameSync(oldPath: string, newPath: string): void
  rmSync?(target: string, options: { recursive: boolean; force: boolean }): void
  chmodSync?(target: string, mode: number): void
}

export type PluginsMigration = "migrated" | "no-legacy" | "target-present"

/**
 * Move an existing `userData/plugins` store into the Eidos home once. Package
 * integrity is re-verified on read, so a partial copy fails closed instead of
 * loading untrusted bytes. A failed copy removes its partial target so the
 * next launch retries from the intact legacy store.
 */
export function migrateLegacyPluginsDirectory(
  fs: SyncFileSystem,
  legacy: string,
  target: string
): PluginsMigration {
  if (!fs.existsSync(legacy)) return "no-legacy"
  if (fs.existsSync(target)) return "target-present"
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
  try {
    fs.cpSync(legacy, target, {
      recursive: true,
      force: false,
      errorOnExist: false,
    })
  } catch (error) {
    try {
      fs.rmSync?.(target, { recursive: true, force: true })
    } catch {
      // Best effort: a partial target only means the next launch retries.
    }
    throw error
  }
  try {
    fs.renameSync(legacy, `${legacy}.migrated`)
  } catch {
    // Keeping the legacy copy is harmless; the store re-verifies every hash.
  }
  return "migrated"
}

export function ensureOwnerOnlyDirectory(
  fs: SyncFileSystem,
  directory: string,
  platform: NodeJS.Platform = process.platform
): void {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  if (platform !== "win32") fs.chmodSync?.(directory, 0o700)
}
