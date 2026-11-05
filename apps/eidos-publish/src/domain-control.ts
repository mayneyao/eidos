import {
  activeCustomDomain,
  customDomainsEnabled,
  domainStub,
  DomainError,
  normalizeCustomHostname,
} from "./domains"

export async function domainSummary(env: Env, tenantId: string) {
  const slot = await env.PUBLISH_TENANTS.getByName(tenantId).getCustomDomain()
  let domain = slot
    ? await domainStub(env, slot.hostname).inspect(tenantId, slot.bindingId)
    : null
  if (domain?.state === "active" && domain.verifiedUntil <= Date.now())
    domain = { ...domain, state: "suspended", error: "verification_expired" }
  return {
    enabled: customDomainsEnabled(env),
    cnameTarget: env.CUSTOM_DOMAIN_CNAME_TARGET,
    domain,
  }
}

export async function domainCommand(
  env: Env,
  tenantId: string,
  action: unknown,
  hostname?: unknown
): Promise<Response> {
  const tenant = env.PUBLISH_TENANTS.getByName(tenantId)
  if (action === "list")
    return Response.json(await domainSummary(env, tenantId), {
      headers: { "Cache-Control": "private, no-store" },
    })
  if (!customDomainsEnabled(env))
    throw new DomainError("custom_domains_unavailable", 503)
  const access = await tenant.getAccessGrant()
  if (
    action !== "remove" &&
    (access.plan !== "pro" || access.state !== "active")
  )
    throw new DomainError("publish_pro_required", 403)
  if (action === "add") {
    const normalized = normalizeCustomHostname(hostname, env.PUBLISH_ROOT)
    if (
      !normalized ||
      `${normalized}.${env.CUSTOM_DOMAIN_DCV_DELEGATION_TARGET}`.length > 253
    )
      throw new DomainError("invalid_custom_hostname", 400)
    const slot = await tenant.reserveCustomDomain(normalized)
    if (!slot) throw new DomainError("custom_domain_limit", 409)
    try {
      if (
        !(await domainStub(env, normalized).claim(
          normalized,
          tenantId,
          slot.bindingId
        ))
      )
        throw new DomainError("domain_already_claimed")
    } catch (cause) {
      await tenant.clearCustomDomain(slot.bindingId)
      throw cause
    }
  } else {
    const slot = await tenant.getCustomDomain()
    if (!slot) throw new DomainError("domain_not_found", 404)
    const stub = domainStub(env, slot.hostname)
    if (action === "check" || action === "activate") {
      if (!(await stub.check(tenantId, slot.bindingId, action === "activate")))
        throw new DomainError("domain_not_found", 404)
    } else if (action === "remove") {
      // Revocation is durable before the external certificate is removed. Failed cleanup is retried by alarm.
      if (!(await stub.remove(tenantId, slot.bindingId)))
        return Response.json(await domainSummary(env, tenantId), {
          status: 202,
          headers: { "Cache-Control": "private, no-store" },
        })
      await tenant.clearCustomDomain(slot.bindingId)
    } else throw new DomainError("invalid_domain_action", 400)
  }
  return Response.json(await domainSummary(env, tenantId), {
    headers: { "Cache-Control": "private, no-store" },
  })
}

export { activeCustomDomain }
