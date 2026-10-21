import fs from "node:fs/promises"
import path from "node:path"
import { createPublicKey, verify, randomUUID } from "node:crypto"
import type { SparkFeature, SparkStatus } from "../../shared/spark"
import {
  hasSparkFeature,
  SPARK_FEATURES,
  SPARK_ACTIVATION_REQUIRED,
} from "../../shared/spark"

interface CertificatePayload {
  version: 1 | 2
  audience: "eidos-lite-spark"
  issuer: string
  subject: string
  hardwareId: string
  licenseId: number
  features: SparkFeature[]
  issuedAt: string
  expiresAt: string | null
  offlinePolicy?: "perpetual"
}
export function verifySparkCertificate(
  certificate: string,
  publicKey: string,
  issuer: string,
  hardwareId: string,
  now = Date.now(),
  allowExpired = false
): CertificatePayload | null {
  try {
    const { payload: p, signature } = JSON.parse(certificate) as {
      payload: CertificatePayload
      signature: string
    }
    const key = createPublicKey({
      key: Buffer.from(publicKey, "base64"),
      format: "der",
      type: "spki",
    })
    if (
      !verify(
        null,
        Buffer.from(JSON.stringify(p)),
        key,
        Buffer.from(signature, "base64")
      )
    )
      return null
    if (
      ![1, 2].includes(p.version) ||
      p.audience !== "eidos-lite-spark" ||
      p.issuer !== issuer ||
      p.hardwareId !== hardwareId ||
      typeof p.subject !== "string" ||
      !p.subject ||
      !Number.isSafeInteger(p.licenseId) ||
      p.licenseId < 1 ||
      !Array.isArray(p.features) ||
      !p.features.every((f) => typeof f === "string" && f.length <= 100) ||
      !Number.isFinite(Date.parse(p.issuedAt)) ||
      Date.parse(p.issuedAt) > now + 300000 ||
      !(
        (p.version === 2 &&
          p.expiresAt === null &&
          p.offlinePolicy === "perpetual") ||
        (p.version === 1 &&
          typeof p.expiresAt === "string" &&
          Number.isFinite(Date.parse(p.expiresAt)) &&
          (allowExpired || Date.parse(p.expiresAt) > now) &&
          Date.parse(p.expiresAt) > Date.parse(p.issuedAt) &&
          Date.parse(p.expiresAt) - Date.parse(p.issuedAt) <= 2592000000)
      )
    )
      return null
    return {
      ...p,
      features: p.features.filter((f) => SPARK_FEATURES.includes(f)),
    }
  } catch {
    return null
  }
}

const CLOCK_SKEW_MS = 5 * 60_000

interface SparkServiceOptions {
  origin: string
  publicKey: string
  cachePath: string
  hardwareId(): Promise<string>
  account(): Promise<{ subject: string; token: string } | null>
  fetch?: typeof fetch
}
export class SparkService {
  private tail: Promise<unknown> = Promise.resolve()
  private current: SparkStatus = {
    state: "inactive",
    source: "none",
    features: [],
    licenses: [],
  }
  constructor(private readonly options: SparkServiceOptions) {}

  status(refresh = false): Promise<SparkStatus> {
    return this.serialize(() => this.readStatus(refresh))
  }
  async require(feature: SparkFeature): Promise<void> {
    let status = await this.status()
    if (status.state === "expired") status = await this.status(true)
    if (!hasSparkFeature(status, feature))
      throw new Error(SPARK_ACTIVATION_REQUIRED)
  }
  activate(licenseId: number): Promise<SparkStatus> {
    return this.serialize(async () => {
      const account = await this.options.account()
      if (!account) throw new Error("Sign in to activate Spark.")
      const result = await this.request("activate", account.token, {
        licenseId,
      })
      const current = await this.options.account()
      if (current?.subject !== account.subject)
        throw new Error("Your account changed. Try activating Spark again.")
      await this.accept(result, account.subject)
      return this.current
    })
  }
  deactivate(): Promise<SparkStatus> {
    return this.serialize(async () => {
      await this.loadCache()
      const licenseId = this.current.licenseId
      const account = await this.options.account()
      if (!account || !licenseId)
        throw new Error(
          "Sign in to the license owner's account to release this Spark device."
        )
      const certificate = await fs.readFile(this.options.cachePath, "utf8")
      const payload = verifySparkCertificate(
        certificate,
        this.options.publicKey,
        this.options.origin,
        await this.options.hardwareId(),
        Date.now(),
        true
      )
      if (payload?.subject !== account.subject)
        throw new Error(
          "Sign in to the license owner's account to release this Spark device."
        )
      // Remove the local lease before releasing the server slot. A failed
      // request can be retried after Refresh restores the authoritative state.
      await this.clearCache()
      this.current = {
        state: "inactive",
        source: "none",
        features: [],
        licenses: [],
      }
      await this.request("deactivate", account.token, { licenseId })
      return this.current
    })
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.tail.then(operation, operation)
    this.tail = task.catch(() => undefined)
    return task
  }
  private async readStatus(refresh: boolean): Promise<SparkStatus> {
    await this.loadCache()
    if (!refresh) return this.current
    try {
      const account = await this.options.account()
      // Signing out does not remove a device license or local file access.
      if (!account) return this.current
      let result = await this.request("entitlements", account.token)
      if (
        result &&
        typeof result === "object" &&
        "certificate" in result &&
        result.certificate === null &&
        "autoActivationLicenseId" in result &&
        typeof result.autoActivationLicenseId === "number" &&
        Number.isSafeInteger(result.autoActivationLicenseId) &&
        result.autoActivationLicenseId > 0
      ) {
        const beforeActivation = await this.options.account()
        if (beforeActivation?.subject !== account.subject)
          throw new Error("Account changed")
        // The server has already denied the cached device grant. Never retain
        // it if an attempted activation of another available license fails.
        await this.accept(result, account.subject)
        result = await this.request("activate", account.token, {
          licenseId: result.autoActivationLicenseId,
          automatic: true,
        })
      }
      const current = await this.options.account()
      if (current?.subject !== account.subject)
        throw new Error("Account changed")
      await this.accept(result, account.subject)
    } catch (error) {
      this.current = {
        ...this.current,
        error: error instanceof Error ? error.message : "spark_unavailable",
        state: this.current.state === "active" ? "active" : "unavailable",
      }
    }
    return this.current
  }
  private async loadCache() {
    try {
      const now = Date.now()
      const lastSeen = await this.readLastSeen()
      const clockRolledBack =
        lastSeen !== null && now + CLOCK_SKEW_MS < lastSeen
      const raw = await fs.readFile(this.options.cachePath, "utf8")
      const p = verifySparkCertificate(
        raw,
        this.options.publicKey,
        this.options.origin,
        await this.options.hardwareId()
      )
      const expired = p
        ? null
        : verifySparkCertificate(
            raw,
            this.options.publicKey,
            this.options.origin,
            await this.options.hardwareId(),
            Date.now(),
            true
          )
      if (!clockRolledBack && (lastSeen === null || now - lastSeen > 60_000))
        await this.writeLastSeen(Math.max(now, lastSeen ?? 0))
      this.current =
        p && !clockRolledBack
          ? {
              state: "active",
              source: "offline",
              features: p.features,
              expiresAt: p.expiresAt ?? undefined,
              perpetualOffline: p.version === 2,
              licenseId: p.licenseId,
              licenses: this.current.licenses,
            }
          : clockRolledBack
            ? {
                state: "expired",
                source: "none",
                features: [],
                error: "System clock changed; refresh Spark while online.",
                licenseId: expired?.licenseId ?? p?.licenseId,
                licenses: this.current.licenses,
              }
            : {
                state: "expired",
                source: "none",
                features: [],
                licenseId: expired?.licenseId,
                licenses: this.current.licenses,
              }
    } catch {
      this.current = {
        state: "inactive",
        source: "none",
        features: [],
        licenses: this.current.licenses,
      }
    }
  }
  private get lastSeenPath(): string {
    return `${this.options.cachePath}.last-seen`
  }
  private async readLastSeen(): Promise<number | null> {
    try {
      const value = Number(
        (await fs.readFile(this.lastSeenPath, "utf8")).trim()
      )
      return Number.isFinite(value) && value > 0 ? value : null
    } catch {
      return null
    }
  }
  private async writeLastSeen(value: number): Promise<void> {
    await fs.mkdir(path.dirname(this.lastSeenPath), {
      recursive: true,
      mode: 0o700,
    })
    const temp = `${this.lastSeenPath}.${randomUUID()}.tmp`
    try {
      await fs.writeFile(temp, String(Math.trunc(value)), {
        mode: 0o600,
        flag: "wx",
      })
      await fs.rename(temp, this.lastSeenPath)
    } finally {
      await fs.unlink(temp).catch(() => undefined)
    }
  }
  private async accept(value: unknown, subject: string) {
    if (!value || typeof value !== "object")
      throw new Error("Invalid Spark response")
    const data = value as {
      certificate?: unknown
      licenses?: SparkStatus["licenses"]
    }
    if (!Array.isArray(data.licenses)) throw new Error("Invalid Spark response")
    if (data.certificate === null) {
      let cachedSubject: string | null = null
      try {
        const cached = verifySparkCertificate(
          await fs.readFile(this.options.cachePath, "utf8"),
          this.options.publicKey,
          this.options.origin,
          await this.options.hardwareId(),
          Date.now(),
          true
        )
        cachedSubject = cached?.subject ?? null
      } catch {
        cachedSubject = null
      }
      // Preserve another account's device certificate for when its owner
      // signs back in. The cache is device-bound, not account-history.
      if (cachedSubject === null || cachedSubject === subject)
        await this.clearCache()
      this.current = {
        state: "inactive",
        source: "online",
        features: [],
        licenses: data.licenses,
      }
      return
    }
    if (typeof data.certificate !== "string")
      throw new Error("Invalid Spark certificate")
    const p = verifySparkCertificate(
      data.certificate,
      this.options.publicKey,
      this.options.origin,
      await this.options.hardwareId()
    )
    if (!p || p.subject !== subject)
      throw new Error(
        "Spark certificate could not be verified. Check the app configuration."
      )
    await fs.mkdir(path.dirname(this.options.cachePath), {
      recursive: true,
      mode: 0o700,
    })
    const temp = `${this.options.cachePath}.${randomUUID()}.tmp`
    try {
      await fs.writeFile(temp, data.certificate, { mode: 0o600, flag: "wx" })
      await fs.rename(temp, this.options.cachePath)
    } finally {
      await fs.unlink(temp).catch(() => undefined)
    }
    await this.writeLastSeen(
      Math.max(Date.now(), (await this.readLastSeen()) ?? 0)
    )
    this.current = {
      state: "active",
      source: "online",
      features: p.features,
      expiresAt: p.expiresAt ?? undefined,
      perpetualOffline: p.version === 2,
      licenseId: p.licenseId,
      licenses: data.licenses,
    }
  }
  private async clearCache() {
    for (const file of [this.options.cachePath, this.lastSeenPath]) {
      try {
        await fs.unlink(file)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      }
    }
  }
  private async request(
    action: string,
    token: string,
    body?: object
  ): Promise<unknown> {
    const response = await (this.options.fetch ?? fetch)(
      new URL(`/api/spark/${action}?certificateVersion=2`, this.options.origin),
      {
        method: body ? "POST" : "GET",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }
    )
    const text = await response.text()
    if (text.length > 1_000_000) throw new Error("spark_unavailable")
    let data: { error?: { code?: string } }
    try {
      data = JSON.parse(text) as { error?: { code?: string } }
    } catch {
      throw new Error("spark_unavailable")
    }
    if (!response.ok) throw new Error(data.error?.code ?? "spark_unavailable")
    return data
  }
}
