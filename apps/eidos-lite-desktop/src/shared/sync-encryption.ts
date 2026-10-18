import { EIDOS_LITE_SERVICE_ENVIRONMENTS } from "./service-environment"

// Keep renderer and trusted-host admission aligned with the published native SDK.
export function supportsEncryptedSync(platform: string): boolean {
  return platform === "darwin" || platform === "linux" || platform === "win32"
}

export function isSyncEncryptionAccountDomain(domain: string): boolean {
  return Object.values(EIDOS_LITE_SERVICE_ENVIRONMENTS).some(
    (environment) => environment.accountOrigin === domain
  )
}

export function assertSyncEncryptionBinding(
  remote: string,
  accountDomain: string
): void {
  const environment = Object.values(EIDOS_LITE_SERVICE_ENVIRONMENTS).find(
    (candidate) => candidate.accountOrigin === accountDomain
  )
  let url: URL
  try {
    url = new URL(remote)
  } catch {
    throw new Error("Encrypted Sync requires a valid official remote URL")
  }
  if (
    !environment ||
    url.origin !== environment.syncRemoteOrigin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/u-[a-z0-9]+\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(url.pathname)
  )
    throw new Error(
      "Encrypted Sync account and remote must use the same official environment"
    )
}
