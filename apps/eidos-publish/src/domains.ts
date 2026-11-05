import { DurableObject } from "cloudflare:workers"
import { refreshTenantEntitlementsIfStale } from "./entitlements"

export interface DomainSlot {
  hostname: string
  bindingId: string
}
export interface DomainRecord extends DomainSlot {
  tenantId: string
  state:
    | "pending_dns"
    | "pending_tls"
    | "ready"
    | "active"
    | "suspended"
    | "removing"
    | "removed"
  verificationToken: string
  providerId: string | null
  provisioningStarted: boolean
  providerStatus: string | null
  sslStatus: string | null
  validationRecords: Array<{ type: string; name: string; value: string }>
  createdAt: number
  inactiveSince: number | null
  checkedAt: number | null
  verifiedUntil: number
  error: string | null
}
export interface DomainSummary {
  enabled: boolean
  cnameTarget: string
  domain: DomainRecord | null
}
const DAY = 86_400_000
const CHECK_INTERVAL = 6 * 60 * 60_000
const RECORD_KEY = "domain"

export function normalizeCustomHostname(
  input: unknown,
  publishRoot: string
): string | null {
  if (
    typeof input !== "string" ||
    input !== input.trim() ||
    /[\s/:@?#\\%]/u.test(input)
  )
    return null
  let host: string
  try {
    host = new URL(`https://${input}`).hostname.toLowerCase()
  } catch {
    return null
  }
  if (
    host.length > 238 ||
    !host.includes(".") ||
    !/^[a-z0-9.-]+$/.test(host) ||
    /^\d+(?:\.\d+)*$/.test(host)
  )
    return null
  if (
    host
      .split(".")
      .some(
        (label) =>
          label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
      )
  )
    return null
  if (
    [
      publishRoot,
      "eidos.space",
      "localhost",
      "local",
      "internal",
      "test",
      "invalid",
      "example",
      "onion",
    ].some((root) => host === root || host.endsWith(`.${root}`))
  )
    return null
  return host
}

export function customDomainsEnabled(env: Env): boolean {
  return (
    String(env.CUSTOM_DOMAINS_ENABLED) === "true" &&
    /^[0-9a-f]{32}$/.test(env.CUSTOM_DOMAIN_ZONE_ID) &&
    typeof env.CLOUDFLARE_CUSTOM_HOSTNAMES_TOKEN === "string" &&
    env.CLOUDFLARE_CUSTOM_HOSTNAMES_TOKEN.length > 0 &&
    normalizeCustomHostname(
      env.CUSTOM_DOMAIN_CNAME_TARGET,
      "unused.invalid"
    ) === env.CUSTOM_DOMAIN_CNAME_TARGET &&
    normalizeCustomHostname(
      env.CUSTOM_DOMAIN_DCV_DELEGATION_TARGET,
      "unused.invalid"
    ) === env.CUSTOM_DOMAIN_DCV_DELEGATION_TARGET
  )
}

export class DomainError extends Error {
  constructor(
    readonly code: string,
    readonly status = 409
  ) {
    super(code)
  }
}

export function domainStub(env: Env, hostname: string) {
  return env.PUBLISH_DOMAINS.getByName(hostname)
}

export async function activeCustomDomain(
  env: Env,
  tenantId: string
): Promise<DomainRecord | null> {
  if (!customDomainsEnabled(env)) return null
  const tenant = env.PUBLISH_TENANTS.getByName(tenantId)
  const [slot, access] = await Promise.all([
    tenant.getCustomDomain(),
    tenant.getAccessGrant(),
  ])
  if (access.plan !== "pro" || access.state !== "active") return null
  if (!slot) return null
  const record = await domainStub(env, slot.hostname).resolve()
  return record?.tenantId === tenantId && record.bindingId === slot.bindingId
    ? record
    : null
}

export async function resolveCustomDomain(
  env: Env,
  hostname: string
): Promise<DomainRecord | null> {
  if (
    !customDomainsEnabled(env) ||
    normalizeCustomHostname(hostname, env.PUBLISH_ROOT) !== hostname
  )
    return null
  const record = await domainStub(env, hostname).resolve()
  if (!record) return null
  const tenant = env.PUBLISH_TENANTS.getByName(record.tenantId)
  try {
    await refreshTenantEntitlementsIfStale(env, record.tenantId, tenant)
  } catch {
    throw new DomainError("identity_unavailable", 503)
  }
  const [slot, access] = await Promise.all([
    tenant.getCustomDomain(),
    tenant.getAccessGrant(),
  ])
  return access.plan === "pro" &&
    access.state === "active" &&
    slot?.hostname === hostname &&
    slot.bindingId === record.bindingId
    ? record
    : null
}

// The application owns this registry. Cloudflare state alone never assigns an Eidos tenant.
export class PublishDomain extends DurableObject<Env> {
  private operation: Promise<unknown> = Promise.resolve()

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.operation.then(fn, fn)
    this.operation = next.catch(() => undefined)
    return next
  }

  async claim(
    hostname: string,
    tenantId: string,
    bindingId: string
  ): Promise<DomainRecord | null> {
    return this.serial(async () => {
      if (
        !customDomainsEnabled(this.env) ||
        normalizeCustomHostname(hostname, this.env.PUBLISH_ROOT) !== hostname
      )
        throw new DomainError("custom_domains_unavailable", 503)
      if (
        `${hostname}.${this.env.CUSTOM_DOMAIN_DCV_DELEGATION_TARGET}`.length >
        253
      )
        throw new DomainError("invalid_custom_hostname", 400)
      const previous = await this.ctx.storage.get<DomainRecord>(RECORD_KEY)
      if (previous && previous.state !== "removed") {
        if (previous.tenantId === tenantId && previous.bindingId === bindingId)
          return previous
        return null
      }
      const record: DomainRecord = {
        hostname,
        tenantId,
        bindingId,
        state: "pending_dns",
        verificationToken: crypto.randomUUID(),
        providerId: null,
        provisioningStarted: false,
        providerStatus: null,
        sslStatus: null,
        validationRecords: [delegationRecord(hostname, this.env)],
        createdAt: Date.now(),
        inactiveSince: Date.now(),
        checkedAt: null,
        verifiedUntil: 0,
        error: null,
      }
      await this.ctx.storage.put(RECORD_KEY, record)
      await this.ctx.storage.setAlarm(Date.now() + DAY)
      return record
    })
  }

  async inspect(
    tenantId: string,
    bindingId: string
  ): Promise<DomainRecord | null> {
    const record = await this.ctx.storage.get<DomainRecord>(RECORD_KEY)
    return record?.tenantId === tenantId && record.bindingId === bindingId
      ? record
      : null
  }

  async resolve(): Promise<DomainRecord | null> {
    const record = await this.ctx.storage.get<DomainRecord>(RECORD_KEY)
    return record?.state === "active" && record.verifiedUntil > Date.now()
      ? record
      : null
  }

  async check(
    tenantId: string,
    bindingId: string,
    activate = false
  ): Promise<DomainRecord | null> {
    return this.serial(async () => {
      const record = await this.inspect(tenantId, bindingId)
      if (!record || record.state === "removed" || record.state === "removing")
        return null
      if (!customDomainsEnabled(this.env))
        throw new DomainError("custom_domains_unavailable", 503)
      // Limit interactive polling and certificate-order churn.
      if (record.checkedAt && Date.now() - record.checkedAt < 30_000) {
        if (
          activate &&
          record.state === "ready" &&
          record.verifiedUntil > Date.now()
        ) {
          record.state = "active"
          record.inactiveSince = null
          await this.ctx.storage.put(RECORD_KEY, record)
          await this.ctx.storage.setAlarm(Date.now() + CHECK_INTERVAL)
        }
        return record
      }
      try {
        const tenant = this.env.PUBLISH_TENANTS.getByName(tenantId)
        await refreshTenantEntitlementsIfStale(this.env, tenantId, tenant)
        const [access, slot] = await Promise.all([
          tenant.getAccessGrant(),
          tenant.getCustomDomain(),
        ])
        if (
          access.plan !== "pro" ||
          access.state !== "active" ||
          slot?.bindingId !== bindingId ||
          slot.hostname !== record.hostname
        ) {
          record.state = "suspended"
          record.verifiedUntil = 0
          record.error = "publish_pro_required"
        } else if (
          !(
            await dnsAnswers(`_eidos-publish.${record.hostname}`, "TXT")
          ).includes(record.verificationToken)
        ) {
          record.state = "pending_dns"
          record.verifiedUntil = 0
          record.error = "ownership_record_missing"
        } else if (
          !(
            await dnsAnswers(`_acme-challenge.${record.hostname}`, "CNAME")
          ).includes(delegationRecord(record.hostname, this.env).value)
        ) {
          record.state = "pending_dns"
          record.verifiedUntil = 0
          record.error = "certificate_delegation_missing"
        } else {
          // Provision only after fresh account-bound DNS proof, never merely an existing CNAME.
          record.provisioningStarted = true
          await this.ctx.storage.put(RECORD_KEY, record)
          const provider = record.providerId
            ? await providerRequest(this.env, `/${record.providerId}`, "GET")
            : await findOrCreateHostname(this.env, record.hostname)
          if (
            provider.hostname !== record.hostname ||
            typeof provider.id !== "string" ||
            !/^[0-9a-f-]{32,36}$/i.test(provider.id)
          )
            throw new DomainError("invalid_provider_response", 502)
          record.providerId = provider.id
          // Persist the external identifier before doing further I/O so failures cannot orphan an order.
          await this.ctx.storage.put(RECORD_KEY, record)
          const ssl = object(provider.ssl)
          record.providerStatus =
            typeof provider.status === "string" ? provider.status : null
          record.sslStatus = typeof ssl.status === "string" ? ssl.status : null
          record.validationRecords = [
            delegationRecord(record.hostname, this.env),
            ...validationRecords(provider),
          ]
          const pointed = await pointsToTarget(
            record.hostname,
            this.env.CUSTOM_DOMAIN_CNAME_TARGET
          )
          const ready =
            record.providerStatus === "active" &&
            record.sslStatus === "active" &&
            pointed
          record.state = ready
            ? activate || record.state === "active"
              ? "active"
              : "ready"
            : "pending_tls"
          record.verifiedUntil = ready ? Date.now() + DAY : 0
          record.error = !pointed
            ? "dns_target_missing"
            : ready
              ? null
              : "certificate_pending"
        }
      } catch (cause) {
        record.error =
          cause instanceof DomainError ? cause.code : "domain_check_unavailable"
        console.warn(
          JSON.stringify({
            event: "custom_domain_check_failed",
            hostname: record.hostname,
            code: record.error,
            detail:
              cause instanceof Error
                ? `${cause.name}: ${cause.message}`.slice(0, 300)
                : "Unknown error",
          })
        )
        // A transient provider outage may use the existing bounded lease; never extend it.
        if (record.verifiedUntil <= Date.now()) record.state = "suspended"
      }
      record.checkedAt = Date.now()
      if (record.state === "active") record.inactiveSince = null
      else record.inactiveSince ??= Date.now()
      await this.ctx.storage.put(RECORD_KEY, record)
      await this.ctx.storage.setAlarm(
        Date.now() + (record.state === "active" ? CHECK_INTERVAL : 60 * 60_000)
      )
      return record
    })
  }

  async remove(tenantId: string, bindingId: string): Promise<boolean> {
    return this.serial(async () => {
      const record = await this.inspect(tenantId, bindingId)
      if (!record || record.state === "removed") return true
      record.state = "removing"
      record.verifiedUntil = 0
      await this.ctx.storage.put(RECORD_KEY, record)
      await this.ctx.storage.setAlarm(Date.now() + 60_000)
      try {
        if (!record.providerId && record.provisioningStarted) {
          const existing = await findHostname(this.env, record.hostname)
          if (typeof existing?.id === "string") record.providerId = existing.id
          await this.ctx.storage.put(RECORD_KEY, record)
        }
        if (record.providerId)
          await providerRequest(this.env, `/${record.providerId}`, "DELETE")
      } catch {
        record.error = "domain_provider_unavailable"
        await this.ctx.storage.put(RECORD_KEY, record)
        return false
      }
      record.providerId = null
      record.state = "removed"
      record.error = null
      await this.ctx.storage.put(RECORD_KEY, record)
      await this.ctx.storage.deleteAlarm()
      return true
    })
  }

  override async alarm(): Promise<void> {
    const record = await this.ctx.storage.get<DomainRecord>(RECORD_KEY)
    if (!record || record.state === "removed") return
    if (
      record.state === "removing" ||
      (record.state !== "active" &&
        Date.now() - (record.inactiveSince ?? Date.now()) > 7 * DAY)
    ) {
      try {
        if (!(await this.remove(record.tenantId, record.bindingId)))
          throw new Error("cleanup_pending")
        await this.env.PUBLISH_TENANTS.getByName(
          record.tenantId
        ).clearCustomDomain(record.bindingId)
      } catch {
        await this.ctx.storage.setAlarm(Date.now() + 60 * 60_000)
      }
      return
    }
    await this.check(record.tenantId, record.bindingId)
  }
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export async function providerRequest(
  env: Env,
  suffix: string,
  method: string,
  body?: unknown
): Promise<Record<string, unknown>> {
  if (!customDomainsEnabled(env))
    throw new DomainError("custom_domains_unavailable", 503)
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${env.CUSTOM_DOMAIN_ZONE_ID}/custom_hostnames${suffix}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_CUSTOM_HOSTNAMES_TOKEN}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    }
  )
  if (method === "DELETE" && response.status === 404) {
    await response.body?.cancel()
    return {}
  }
  const value = object(await boundedJson(response))
  if (!response.ok || value.success !== true)
    throw new DomainError("domain_provider_unavailable", 502)
  return Array.isArray(value.result)
    ? { items: value.result }
    : object(value.result)
}

async function findHostname(
  env: Env,
  hostname: string
): Promise<Record<string, unknown> | null> {
  const list = await providerRequest(
    env,
    `?hostname=${encodeURIComponent(hostname)}`,
    "GET"
  )
  const matches = Array.isArray(list.items)
    ? list.items.map(object).filter((item) => item.hostname === hostname)
    : []
  if (matches.length > 1) throw new DomainError("domain_provider_conflict", 502)
  return matches[0] ?? null
}

async function findOrCreateHostname(
  env: Env,
  hostname: string
): Promise<Record<string, unknown>> {
  return (
    (await findHostname(env, hostname)) ??
    (await providerRequest(env, "", "POST", {
      hostname,
      ssl: {
        method: "txt",
        type: "dv",
        ...(hostname.length > 64 ? { cloudflare_branding: true } : {}),
        settings: { min_tls_version: "1.2" },
      },
    }))
  )
}

async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new DomainError("invalid_provider_response", 502)
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      length += part.value.byteLength
      if (length > 65_536)
        throw new DomainError("invalid_provider_response", 502)
      chunks.push(part.value)
    }
  } finally {
    await reader.cancel()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown
}

export async function dnsAnswers(
  name: string,
  type: "TXT" | "CNAME" | "A" | "AAAA"
): Promise<string[]> {
  const url = new URL("https://cloudflare-dns.com/dns-query")
  url.searchParams.set("name", name)
  url.searchParams.set("type", type)
  const response = await fetch(url, {
    headers: { Accept: "application/dns-json" },
    redirect: "error",
    signal: AbortSignal.timeout(5_000),
  })
  const value = object(await boundedJson(response))
  if (response.ok && value.Status === 3) return []
  if (!response.ok || value.Status !== 0)
    throw new DomainError("dns_check_unavailable", 502)
  const code = { A: 1, CNAME: 5, TXT: 16, AAAA: 28 }[type]
  return Array.isArray(value.Answer)
    ? value.Answer.map(object)
        .filter(
          (answer) => answer.type === code && typeof answer.data === "string"
        )
        .map((answer) => {
          const data = answer.data as string
          return type === "TXT"
            ? [...data.matchAll(/"([^"\\]*)"/g)]
                .map((match) => match[1])
                .join("")
            : data.toLowerCase().replace(/\.$/, "")
        })
    : []
}

async function pointsToTarget(
  hostname: string,
  target: string
): Promise<boolean> {
  if ((await dnsAnswers(hostname, "CNAME")).includes(target)) return true
  // Apex flattening exposes addresses, so require both fresh TXT proof and target address overlap.
  const [actual4, actual6, target4, target6] = await Promise.all([
    dnsAnswers(hostname, "A"),
    dnsAnswers(hostname, "AAAA"),
    dnsAnswers(target, "A"),
    dnsAnswers(target, "AAAA"),
  ])
  const actual = [...actual4, ...actual6],
    expected = new Set([...target4, ...target6])
  return actual.length > 0 && actual.every((address) => expected.has(address))
}

function validationRecords(
  provider: Record<string, unknown>
): DomainRecord["validationRecords"] {
  const records: DomainRecord["validationRecords"] = []
  const ownership = object(provider.ownership_verification)
  if (typeof ownership.name === "string" && typeof ownership.value === "string")
    records.push({ type: "TXT", name: ownership.name, value: ownership.value })
  // Delegated DCV is required, so do not ask the user to place conflicting order-specific ACME TXT records.
  return records
}

function delegationRecord(hostname: string, env: Env) {
  return {
    type: "CNAME",
    name: `_acme-challenge.${hostname}`,
    value: `${hostname}.${env.CUSTOM_DOMAIN_DCV_DELEGATION_TARGET}`,
  }
}
