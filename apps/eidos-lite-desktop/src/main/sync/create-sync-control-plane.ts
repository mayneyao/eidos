import path from "node:path"
import os from "node:os"
import { app, safeStorage, shell } from "electron"

import type { EidosLiteServiceEnvironment } from "../../shared/service-environment"
import { AccountSyncClient } from "../account/account-sync-client"
import { AccountSessionService } from "../account/account-session"
import { SecureAccountCredentialStore } from "../account/credential-store"
import { DeviceIdentityStore } from "../account/device-identity"
import { EidosOAuthClient } from "../account/oauth-client"
import { OfficialSyncClient } from "./official-sync-client"
import { SyncControlPlane } from "./sync-control-plane"

export function createSyncControlPlane(
  environment: EidosLiteServiceEnvironment
): SyncControlPlane {
  const credentials = new SecureAccountCredentialStore(
    path.join(
      app.getPath("userData"),
      "accounts",
      environment.name,
      "oauth-session.bin"
    ),
    {
      isAvailable: () => safeStorage.isEncryptionAvailable(),
      encrypt: (value) => safeStorage.encryptString(value),
      decrypt: (value) => safeStorage.decryptString(value),
    }
  )
  const oauth = new EidosOAuthClient(environment)
  const deviceIdentity = new DeviceIdentityStore(
    path.join(app.getPath("userData"), "device-identity.json")
  )
  const account = new AccountSessionService(
    oauth,
    credentials,
    deviceIdentity,
    new AccountSyncClient(environment),
    {
      callbackPort: 13_128,
      openExternal: (url) => shell.openExternal(url),
      device: {
        displayName: deviceDisplayName(),
        platform: devicePlatform(),
        appVersion: app.getVersion(),
      },
    }
  )
  return new SyncControlPlane(
    environment,
    account,
    new OfficialSyncClient(environment)
  )
}

function deviceDisplayName(): string {
  const hostname = os.hostname().trim()
  return (hostname || `Eidos Lite on ${devicePlatform()}`).slice(0, 80)
}

function devicePlatform(): "macos" | "windows" | "linux" | "unknown" {
  if (process.platform === "darwin") return "macos"
  if (process.platform === "win32") return "windows"
  if (process.platform === "linux") return "linux"
  return "unknown"
}
