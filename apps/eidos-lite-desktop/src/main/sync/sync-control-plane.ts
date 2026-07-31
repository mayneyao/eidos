import type {
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

export class SyncControlPlane {
  constructor(
    private readonly environment: EidosLiteServiceEnvironment,
    private readonly account: AccountSessionService,
    readonly remote: OfficialSyncClient
  ) {}

  async status(remoteUrl: string | null = null): Promise<EidosSyncStatus> {
    const account = await this.account.status()
    return account.state === "signed-in"
      ? await this.projectSignedInStatus(
          account,
          await this.account.authorization(),
          remoteUrl
        )
      : this.projectStatus(account, undefined, remoteUrl)
  }

  async signIn(remoteUrl: string | null = null): Promise<EidosSyncStatus> {
    const account = await this.account.signIn()
    return await this.projectSignedInStatus(
      account,
      account.authorization ?? (await this.account.authorization()),
      remoteUrl
    )
  }

  async signOut(remoteUrl: string | null = null): Promise<EidosSyncStatus> {
    return this.projectStatus(
      await this.account.signOut(),
      undefined,
      remoteUrl
    )
  }

  async provisionRepository(repository: string): Promise<{
    remoteUrl: string
    accessToken: string
  }> {
    const authorization = await this.account.authorization()
    if (authorization.access?.access !== "read_write") {
      throw new SyncPolicyError(
        "An active Eidos Sync subscription with write access is required.",
        "entitlement-inactive"
      )
    }
    const accessToken = await this.account.accessToken()
    const provisioned = await this.remote.provisionRepository(
      repository,
      accessToken
    )
    return { remoteUrl: provisioned.remoteUrl, accessToken }
  }

  async repositories(): Promise<EidosSyncRepositoryList> {
    const { accessToken } = await this.repositoryAccess()
    await this.remote.discover()
    return this.remote.listRepositories(accessToken)
  }

  async repositoryAccess(remoteUrl?: string): Promise<{
    accessToken: string
    access: "read_only" | "read_write"
  }> {
    const authorization = await this.account.authorization()
    const access = authorization.access?.access
    if (access !== "read_only" && access !== "read_write") {
      throw new SyncPolicyError(
        "An active Eidos Sync subscription is required.",
        "entitlement-inactive"
      )
    }
    const accessToken = await this.account.accessToken()
    if (remoteUrl) {
      await this.remote.discover()
      const listed = await this.remote.listRepositories(accessToken)
      if (!listed.repositories.some((entry) => entry.remoteUrl === remoteUrl)) {
        throw new SyncPolicyError(
          "This Hosted Remote is not available to the signed-in account.",
          "remote-not-found"
        )
      }
    }
    return { accessToken, access }
  }

  private async projectSignedInStatus(
    account: AccountSessionStatus,
    authorization: SyncAuthorization,
    remoteUrl: string | null
  ): Promise<EidosSyncStatus> {
    const access = authorization.access?.access
    let usage: OfficialSyncUsage | undefined
    if (access === "read_only" || access === "read_write") {
      try {
        usage = await this.remote.usage(await this.account.accessToken())
      } catch (error) {
        console.warn("Could not load Eidos Sync storage usage", error)
      }
    }
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
    const access = grant?.access
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
                "This Sync subscription is read-only. You can clone, but cannot push changes.",
            }
          : access === "blocked"
            ? {
                code: "access-blocked" as const,
                message: "Eidos Sync access is currently blocked.",
              }
            : {
                code: "subscription-required" as const,
                message: "An active Eidos Sync subscription is required.",
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
