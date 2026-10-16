import { createRequire } from "node:module"
import path from "node:path"
import type * as publishedGraftSdk from "@eidos.space/graft"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { resolveEidosLiteServiceEnvironment } from "../../shared/service-environment"
import { applyGraftSdkLoadingPolicy } from "./graft-sdk-loading-policy"
import type {
  CloneOptions,
  RemoteOperationOptions,
  RepositorySession as PublishedRepositorySession,
} from "@eidos.space/graft"

import type { GraftMergeRepositorySession } from "../../shared/graft-merge-contracts"
import type { GraftTransferProgress } from "../../shared/graft-sdk-contracts"

type PublishedGraftSdk = typeof publishedGraftSdk

interface TransferProgressOptions {
  onProgress?: (progress: GraftTransferProgress) => void
}

export type EidosGraftRepositorySession = Omit<
  PublishedRepositorySession,
  "push" | "fetch" | "pull" | "cloneRepository"
> &
  GraftMergeRepositorySession & {
    push(
      options?: RemoteOperationOptions & TransferProgressOptions
    ): Promise<unknown>
    fetch(
      options?: RemoteOperationOptions & TransferProgressOptions
    ): Promise<unknown>
    pull(
      options?: RemoteOperationOptions & TransferProgressOptions
    ): Promise<unknown>
    cloneRepository(
      options: CloneOptions & TransferProgressOptions
    ): Promise<unknown>
  }

export interface EidosGraftSdkModule extends Omit<
  PublishedGraftSdk,
  "RepositorySession"
> {
  RepositorySession: {
    new (target: string): EidosGraftRepositorySession
    open(
      target: string,
      options?: {
        signal?: AbortSignal
        encryptedRemote?: publishedGraftSdk.EncryptedRemoteSession
      }
    ): Promise<EidosGraftRepositorySession>
  }
}

const require = createRequire(import.meta.url)
declare const __EIDOS_LITE_SOURCE_GRAFT_OVERRIDES__: boolean | undefined
declare const __EIDOS_LITE_DEFAULT_ENVIRONMENT__: string | undefined
declare const __EIDOS_LITE_GRAFT_SOURCE_SNAPSHOT__: boolean | undefined
const sourceSnapshot =
  typeof __EIDOS_LITE_GRAFT_SOURCE_SNAPSHOT__ === "boolean" &&
  __EIDOS_LITE_GRAFT_SOURCE_SNAPSHOT__
const sourceExecution =
  typeof __EIDOS_LITE_SOURCE_GRAFT_OVERRIDES__ === "boolean"
    ? __EIDOS_LITE_SOURCE_GRAFT_OVERRIDES__
    : fileURLToPath(import.meta.url).endsWith(".ts") &&
      (process.env.NODE_ENV === "development" ||
        process.env.NODE_ENV === "test" ||
        process.env.VITEST === "true" ||
        process.env.VITEST === "1")
const environment = resolveEidosLiteServiceEnvironment(
  sourceExecution
    ? process.env.EIDOS_LITE_ENVIRONMENT
    : typeof __EIDOS_LITE_DEFAULT_ENVIRONMENT__ === "string"
      ? __EIDOS_LITE_DEFAULT_ENVIRONMENT__
      : "staging"
).name
let bundledStagingBinding: string | undefined
if (environment === "staging" && sourceSnapshot) {
  const resources = (process as NodeJS.Process & { resourcesPath?: string })
    .resourcesPath
  const candidates = [
    resources ? path.join(resources, "graft-e2ee/graft-sdk.node") : "",
    ...(sourceExecution
      ? [
          path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            "../resources/graft-e2ee/graft-sdk.node"
          ),
          path.resolve(
            process.cwd(),
            "apps/eidos-lite-desktop/resources/graft-e2ee/graft-sdk.node"
          ),
          path.resolve(process.cwd(), "resources/graft-e2ee/graft-sdk.node"),
        ]
      : []),
  ]
  bundledStagingBinding = candidates.find(
    (candidate) => candidate && existsSync(candidate)
  )
}
applyGraftSdkLoadingPolicy({
  sourceExecution,
  environment,
  variables: process.env,
  bundledStagingBinding,
  sourceSnapshot,
})
const installedGraftSdk = require("@eidos.space/graft") as PublishedGraftSdk
if (!sourceExecution && environment === "production") {
  if (typeof installedGraftSdk.EncryptedRemoteSession !== "function")
    throw new Error(
      "This Eidos Lite build is missing the required encrypted Sync SDK"
    )
  try {
    new installedGraftSdk.EncryptedRemoteSession({
      remoteName: "origin",
      url: "https://release-check.invalid/namespace/repository",
      uuid: "invalid",
      authenticationDomain: "https://release-check.invalid",
      accountSubject: "release-check",
      bearerToken: "synthetic-release-check",
      checkpointDirectory: "unused",
      recoveryDirectory: "unused",
      stagingDirectory: "unused",
      createCheckpoint: true,
    })
    throw new Error("The encrypted Sync SDK accepted an invalid binding")
  } catch (error) {
    if (
      (error as { code?: string }).code !==
      "GRAFT_SDK_E2EE_INVALID_SESSION_BINDING"
    )
      throw new Error(
        "This Eidos Lite build is missing native encrypted Sync support",
        { cause: error }
      )
  }
}
let cachedModule: EidosGraftSdkModule | null = null

/**
 * Source development and Vitest may opt into a local SDK build.
 * Production bundles keep resolving the pinned package and never evaluate an
 * arbitrary path inherited from the environment.
 */
export function loadEidosGraftSdk(): EidosGraftSdkModule {
  if (cachedModule) return cachedModule
  const configuredPath = process.env.EIDOS_LITE_GRAFT_SDK_PATH?.trim()
  if (!configuredPath) {
    cachedModule = installedGraftSdk as EidosGraftSdkModule
    return cachedModule
  }
  if (!sourceExecution) {
    throw new Error(
      "EIDOS_LITE_GRAFT_SDK_PATH is available only in source development and tests"
    )
  }
  const loaded = require(path.resolve(configuredPath)) as EidosGraftSdkModule
  if (
    typeof loaded.RepositorySession !== "function" ||
    typeof loaded.operationMaterializesWorktree !== "function" ||
    typeof loaded.sdkVersion !== "function"
  ) {
    throw new Error("The local Graft SDK override has an invalid module shape")
  }
  cachedModule = loaded
  return cachedModule
}

export function resetEidosGraftSdkForTesting(): void {
  cachedModule = null
}
