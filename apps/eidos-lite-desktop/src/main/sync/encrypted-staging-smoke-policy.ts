import fs from "node:fs"
import path from "node:path"

import type { EidosLiteEnvironmentName } from "../../shared/service-environment"

export function stagingFixtureCli(
  packaged: boolean,
  resourcesPath: string,
  platform: NodeJS.Platform = process.platform
): string {
  return packaged
    ? path.join(
        resourcesPath,
        "publish-engine",
        platform === "win32" ? "eidos.exe" : "eidos"
      )
    : "eidos"
}

export function assertPrivateStagingPath(
  target: string,
  kind: "file" | "directory"
): void {
  if (!path.isAbsolute(target))
    throw new Error("Staging validation paths must be absolute")
  const metadata = fs.lstatSync(target)
  if (
    metadata.isSymbolicLink() ||
    !(kind === "file" ? metadata.isFile() : metadata.isDirectory()) ||
    (metadata.mode & 0o077) !== 0 ||
    (typeof process.getuid === "function" && metadata.uid !== process.getuid())
  )
    throw new Error(`Staging validation requires an owner-only regular ${kind}`)
}

export function encryptedStagingSmokeRequest({
  packaged,
  environment,
  sourceSnapshot,
  variables,
}: {
  packaged: boolean
  environment: EidosLiteEnvironmentName
  sourceSnapshot: boolean
  variables: NodeJS.ProcessEnv
}): string | undefined {
  const result = variables.EIDOS_LITE_STAGING_E2EE_RESULT
  if (!result) return undefined
  // This check precedes filesystem access and must use the resolved compiled
  // preset for packaged apps. Runtime variables cannot redirect production.
  if (environment !== "staging")
    throw new Error("Encrypted staging validation is unavailable in production")
  if (variables.EIDOS_LITE_SMOKE_RESULT || variables.EIDOS_LITE_SMOKE_SPACE)
    throw new Error("Select only one packaged validation mode")
  if (
    packaged &&
    (sourceSnapshot ||
      variables.EIDOS_LITE_GRAFT_SDK_PATH ||
      variables.GRAFT_SDK_NATIVE_PATH ||
      variables.EIDOS_LITE_STAGING_UI_PROFILES)
  )
    throw new Error(
      "Packaged encrypted validation requires bundled release dependencies"
    )
  if (!path.isAbsolute(result))
    throw new Error("Staging smoke result path must be absolute")
  return result
}

/** Validate before changing Electron's profile, reading secrets, or connecting. */
export function prepareEncryptedStagingSmokeProfile(
  result: string,
  currentUserData: string,
  variables: NodeJS.ProcessEnv
): string {
  const directory = path.dirname(result)
  assertPrivateStagingPath(directory, "directory")
  const canonicalDirectory = fs.realpathSync(directory)
  const canonicalUserData = fs.existsSync(currentUserData)
    ? fs.realpathSync(currentUserData)
    : path.resolve(currentUserData)
  const relative = path.relative(canonicalUserData, canonicalDirectory)
  if (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  )
    throw new Error("Staging validation must use a separate evidence directory")
  try {
    fs.lstatSync(result)
    throw new Error("Staging validation requires a new result file")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  const token = variables.EIDOS_LITE_STAGING_TOKEN_FILE
  const account = variables.EIDOS_LITE_STAGING_ACCOUNT_STATE
  if (Boolean(token) === Boolean(account))
    throw new Error("Staging validation requires exactly one credential file")
  assertPrivateStagingPath((token ?? account)!, "file")
  const enrollment = variables.EIDOS_LITE_STAGING_REMEMBER_ENROLLMENT
  if (enrollment) assertPrivateStagingPath(enrollment, "file")
  const profile = path.join(canonicalDirectory, "app-user-data")
  if (!fs.existsSync(profile)) fs.mkdirSync(profile, { mode: 0o700 })
  assertPrivateStagingPath(profile, "directory")
  return profile
}
