import { parsePrincipal } from "./auth"
import type { PublishPrincipal } from "./contracts"
import type { PublishTenant } from "./tenant"

const REFRESH_MILLISECONDS = 5 * 60_000

export async function refreshTenantEntitlements(
  env: Env,
  tenantId: string,
  tenant: DurableObjectStub<PublishTenant>,
  force = false
): Promise<PublishPrincipal> {
  const context = await tenant.getEntitlementContext()
  if (
    !force &&
    Date.now() - Date.parse(context.checkedAt) < REFRESH_MILLISECONDS
  ) {
    throw new EntitlementRefreshNotRequired()
  }
  const origin = new URL(env.AUTH_USERINFO_URL).origin
  let response: Response
  try {
    response = await env.EIDOS_ACCOUNT.fetch(
      new URL("/api/publish/internal-userinfo", origin),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Eidos-Publish-Service": env.PUBLISH_SERVICE_SECRET,
        },
        body: JSON.stringify({ userId: context.ownerUserId }),
        signal: AbortSignal.timeout(5_000),
      }
    )
  } catch {
    throw new EntitlementRefreshError()
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new EntitlementRefreshError()
  }
  const principal = parsePrincipal(await response.json())
  if (principal.userId !== context.ownerUserId)
    throw new EntitlementRefreshError()
  await tenant.initialize(principal.userId, tenantId, principal.access, null)
  return principal
}

export async function refreshTenantEntitlementsIfStale(
  env: Env,
  tenantId: string,
  tenant: DurableObjectStub<PublishTenant>
): Promise<void> {
  try {
    await refreshTenantEntitlements(env, tenantId, tenant)
  } catch (cause) {
    if (cause instanceof EntitlementRefreshNotRequired) return
    throw cause
  }
}

export class EntitlementRefreshError extends Error {
  constructor() {
    super("Current Publish entitlements are unavailable")
    this.name = "EntitlementRefreshError"
  }
}

class EntitlementRefreshNotRequired extends Error {}
