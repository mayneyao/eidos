import path from "node:path"
import { app, safeStorage } from "electron"
import type { EidosLiteServiceEnvironment } from "../../shared/service-environment"
import type { SyncControlPlane } from "./sync-control-plane"
import {
  RememberedSyncUnlocks,
  RememberedSyncUnlockStore,
  canRememberSyncUnlock,
} from "./remembered-sync-unlocks"

export function createRememberedSyncUnlocks(
  control: Pick<SyncControlPlane, "accountSubject" | "repositories">,
  environment: EidosLiteServiceEnvironment,
  options: { stateDirectory?: string } = {}
): RememberedSyncUnlocks {
  const store = new RememberedSyncUnlockStore(
    path.join(app.getPath("userData"), "remembered-sync", environment.name),
    {
      isAvailable: () =>
        canRememberSyncUnlock(
          process.platform,
          safeStorage.isEncryptionAvailable(),
          process.platform === "linux"
            ? safeStorage.getSelectedStorageBackend()
            : undefined
        ),
      encrypt: (value) => safeStorage.encryptString(value),
      decrypt: (value) => safeStorage.decryptString(value),
    }
  )
  return new RememberedSyncUnlocks(
    control,
    environment.accountOrigin,
    options.stateDirectory ??
      path.join(app.getPath("userData"), "encrypted-sync", environment.name),
    store
  )
}
