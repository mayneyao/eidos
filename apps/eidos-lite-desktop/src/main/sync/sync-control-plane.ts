import type {
  EidosSyncEncryption,
  EidosSyncRepositoryList,
  EidosSyncStatus,
  SyncAccountStatus,
} from "../../shared/contracts"
import type { EidosLiteServiceEnvironment } from "../../shared/service-environment"
import type { SyncAuthorization } from "../account/account-sync-client"
import type {
  AccountSessionService,
  AccountSessionStatus,
} from "../account/account-session"
import type {
  OfficialSyncClient,
  OfficialSyncUsage,
} from "./official-sync-client"

export class SyncPolicyError extends Error {
  constructor(
    message: string,
    readonly code: "entitlement-inactive" | "remote-not-found"
  ) {
    super(message)
    this.name = "SyncPolicyError"
  }
}

export interface SyncOperationContext {
  readonly subject: string
  readonly accessToken: string
  readonly access: "read_only" | "read_write"
  assertCurrent(): void
}

export class SyncControlPlane {
  private operationGeneration = 0
  private accountChangeGeneration: number | null = null
  private readonly operationContexts = new WeakSet<SyncOperationContext>()
  constructor(
    private readonly environment: EidosLiteServiceEnvironment,
    private readonly account: AccountSessionService,
    readonly remote: OfficialSyncClient,
    /**
     * Development-only preview of an expired/read-only entitlement. The real
     * grant is ignored so the desktop UI can render the paused state locally.
     */
    private readonly forceReadOnly = false
  ) {}

  async status(remoteUrl: string | null = null): Promise<EidosSyncStatus> {
    const generation = this.operationGeneration
    this.assertCurrent(generation)
    const account = await this.account.status()
    this.assertCurrent(generation)
    return account.state === "signed-in"
      ? await this.projectSignedInStatus(
          account,
          await this.account.authorization(),
          remoteUrl,
          () => this.assertCurrent(generation)
        )
      : this.projectStatus(account, undefined, remoteUrl)
  }

  async accountStatus(): Promise<SyncAccountStatus> {
    const generation = this.operationGeneration
    this.assertCurrent(generation)
    const status = await this.account.status()
    this.assertCurrent(generation)
    return status
  }

  async signIn(remoteUrl: string | null = null): Promise<EidosSyncStatus> {
    const generation = ++this.operationGeneration
    this.accountChangeGeneration = generation
    try {
      const account = await this.account.signIn()
      this.assertCurrent(generation, true)
      return await this.projectSignedInStatus(
        account,
        account.authorization ?? (await this.account.authorization()),
        remoteUrl,
        () => this.assertCurrent(generation, true)
      )
    } finally {
      this.finishAccountChange(generation)
    }
  }

  async signOut(remoteUrl: string | null = null): Promise<EidosSyncStatus> {
    const generation = ++this.operationGeneration
    this.accountChangeGeneration = generation
    try {
      const account = await this.account.signOut()
      this.assertCurrent(generation, true)
      return this.projectStatus(account, undefined, remoteUrl)
    } finally {
      this.finishAccountChange(generation)
    }
  }

  private finishAccountChange(generation: number): void {
    if (generation !== this.operationGeneration) return
    this.accountChangeGeneration = null
    this.operationGeneration += 1
  }

  private assertCurrent(generation: number, allowAccountChange = false): void {
    if (
      generation !== this.operationGeneration ||
      (!allowAccountChange && this.accountChangeGeneration !== null)
    ) {
      throw Object.assign(
        new Error(
          "The Sync account changed. Try again with the current account."
        ),
        { code: "authentication-required" }
      )
    }
  }

  /** First-party account credential for non-Sync services such as Publish. */
  async accountAccessToken(): Promise<string> {
    const generation = this.operationGeneration
    this.assertCurrent(generation)
    const token = await this.account.accessToken()
    this.assertCurrent(generation)
    return token
  }

  async accountSubject(): Promise<string> {
    const status = await this.accountStatus()
    if (status.state !== "signed-in" || !status.user?.id) {
      throw new Error("Sign in to Eidos first.")
    }
    return status.user.id
  }

  async operationContext(): Promise<SyncOperationContext> {
    const generation = this.operationGeneration
    const assertCurrent = () => this.assertCurrent(generation)
    assertCurrent()
    const authorization = await this.account.authorization()
    assertCurrent()
    const access = this.forceReadOnly
      ? "read_only"
      : authorization.access?.access
    if (access !== "read_only" && access !== "read_write") {
      throw new SyncPolicyError(
        "Eidos Sync access is required.",
        "entitlement-inactive"
      )
    }
    const accessToken = await this.account.accessToken()
    assertCurrent()
    const subject = await this.accountSubject()
    assertCurrent()
    if (subject !== authorization.subject) {
      throw Object.assign(
        new Error(
          "The Sync account changed. Try again with the current account."
        ),
        { code: "authentication-required" }
      )
    }
    const context = Object.freeze({
      subject,
      accessToken,
      access,
      assertCurrent,
    })
    this.operationContexts.add(context)
    return context
  }

  private assertContext(context: SyncOperationContext): void {
    if (!this.operationContexts.has(context))
      throw new Error("Sync operation belongs to another account environment")
    context.assertCurrent()
  }

  async provisionRepository(
    repository: string,
    displayName: string,
    encrypted = false,
    context?: SyncOperationContext
  ): Promise<{
    remoteUrl: string
    accessToken: string
    encryption?: EidosSyncEncryption
  }> {
    const operation = context ?? (await this.operationContext())
    this.assertContext(operation)
    if (operation.access !== "read_write") {
      throw new SyncPolicyError(
        "Eidos Sync write access is required.",
        "entitlement-inactive"
      )
    }
    const { accessToken } = operation
    const provisioned = encrypted
      ? await this.remote.provisionRepository(
          repository,
          displayName,
          accessToken,
          true
        )
      : await this.remote.provisionRepository(
          repository,
          displayName,
          accessToken
        )
    this.assertContext(operation)
    return {
      remoteUrl: provisioned.remoteUrl,
      accessToken,
      ...(provisioned.encryption ? { encryption: provisioned.encryption } : {}),
    }
  }

  async repositories(
    context?: SyncOperationContext
  ): Promise<EidosSyncRepositoryList> {
    const operation = context ?? (await this.operationContext())
    this.assertContext(operation)
    await this.remote.discover()
    this.assertContext(operation)
    const repositories = await this.remote.listRepositories(
      operation.accessToken
    )
    this.assertContext(operation)
    return repositories
  }

  async repairLegacyRepositoryDisplayName(
    remoteUrl: string,
    displayName: string
  ): Promise<boolean> {
    let operation: SyncOperationContext
    try {
      operation = await this.operationContext()
    } catch (error) {
      if (
        error instanceof SyncPolicyError &&
        error.code === "entitlement-inactive"
      )
        return false
      throw error
    }
    if (operation.access !== "read_write") return false
    const listed = await this.repositories(operation)
    const repository = listed.repositories.find(
      (entry) => entry.remoteUrl === remoteUrl
    )
    if (
      repository === undefined ||
      repository.displayName !== repository.name ||
      repository.displayName === displayName
    ) {
      return false
    }
    this.assertContext(operation)
    await this.remote.renameRepository(
      repository.name,
      displayName,
      operation.accessToken
    )
    this.assertContext(operation)
    return true
  }

  async repositoryAccess(
    remoteUrl?: string,
    context?: SyncOperationContext
  ): Promise<{
    accessToken: string
    access: "read_only" | "read_write"
  }> {
    const operation = context ?? (await this.operationContext())
    this.assertContext(operation)
    const { access, accessToken } = operation
    if (remoteUrl) {
      const listed = await this.repositories(operation)
      if (!listed.repositories.some((entry) => entry.remoteUrl === remoteUrl)) {
        throw new SyncPolicyError(
          "This Hosted Remote is not available to the signed-in account.",
          "remote-not-found"
        )
      }
    }
    this.assertContext(operation)
    return { accessToken, access }
  }

  private async projectSignedInStatus(
    account: AccountSessionStatus,
    authorization: SyncAuthorization,
    remoteUrl: string | null,
    assertCurrent: () => void
  ): Promise<EidosSyncStatus> {
    assertCurrent()
    if (account.user?.id !== authorization.subject)
      throw new Error("The Sync account changed. Refresh account status.")
    const access = authorization.access?.access
    let usage: OfficialSyncUsage | undefined
    if (access === "read_only" || access === "read_write") {
      try {
        const accessToken = await this.account.accessToken()
        assertCurrent()
        usage = await this.remote.usage(accessToken)
      } catch (error) {
        console.warn("Could not load Eidos Sync storage usage", error)
      }
    }
    assertCurrent()
    return this.projectStatus(account, authorization, remoteUrl, usage)
  }

  private projectStatus(
    account: SyncAccountStatus | AccountSessionStatus,
    authorization?: SyncAuthorization,
    remoteUrl: string | null = null,
    usage?: OfficialSyncUsage
  ): EidosSyncStatus {
    if (account.state === "signed-out") {
      return {
        environment: this.environment.name,
        account,
        device: { state: "not-registered" },
        entitlement: {
          state: "not-checked",
          detail:
            "Checked only after you sign in to enable Sync or clone a Space.",
        },
        remote: remoteUrl
          ? { state: "connected", url: remoteUrl }
          : { state: "not-connected" },
        canEnable: false,
        canClone: false,
        blocker: {
          code: "authentication-required",
          message: "Sign in with your eidos.space account to continue.",
        },
      }
    }

    const grant = authorization?.access ?? null
    const access = this.forceReadOnly ? "read_only" : grant?.access
    const entitlementState =
      access === "read_write"
        ? "read-write"
        : access === "read_only"
          ? "read-only"
          : access === "blocked"
            ? "blocked"
            : "none"
    const blocker =
      access === "read_write"
        ? null
        : access === "read_only"
          ? {
              code: "read-only" as const,
              message:
                "This Sync access is read-only. You can clone, but cannot push changes.",
            }
          : access === "blocked"
            ? {
                code: "access-blocked" as const,
                message: "Eidos Sync access is currently blocked.",
              }
            : {
                code: "access-required" as const,
                message: "Eidos Sync access is required.",
              }
    return {
      environment: this.environment.name,
      account,
      device: { state: "active" },
      entitlement: {
        state: entitlementState,
        detail:
          access === "read_write"
            ? "Account, device, write access, and quota checks passed."
            : access === "read_only"
              ? "Existing hosted data remains readable, but new pushes are disabled."
              : access === "blocked"
                ? "The account service did not grant read or write access."
                : "No Eidos Sync access grant is attached to this account.",
        ...(grant
          ? {
              quotaBytes: usage?.quotaBytes ?? grant.quotaBytes,
              ...(usage
                ? {
                    usedBytes: usage.usedBytes,
                    reservedBytes: usage.reservedBytes,
                    remainingBytes: usage.remainingBytes,
                  }
                : {}),
            }
          : {}),
      },
      remote: remoteUrl
        ? { state: "connected", url: remoteUrl }
        : { state: "not-connected" },
      canEnable: access === "read_write" && remoteUrl === null,
      canClone: access === "read_write" || access === "read_only",
      blocker,
    }
  }
}
