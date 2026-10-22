import { it } from "vitest"
import { verifyNativeWindowsSyncSecretFiles } from "./windows-sync-secret-files-test-support"

it.skipIf(process.platform !== "win32")(
  "protects Windows ciphertext with native ACLs and rejects broad access and junctions",
  verifyNativeWindowsSyncSecretFiles,
  30_000
)
