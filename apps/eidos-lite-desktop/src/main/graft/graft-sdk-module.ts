import { createRequire } from "node:module"
import path from "node:path"
import * as publishedGraftSdk from "@eidos.space/graft"
import type { RepositorySession as PublishedRepositorySession } from "@eidos.space/graft"

import type { GraftMergeRepositorySession } from "../../shared/graft-merge-contracts"

type PublishedGraftSdk = typeof publishedGraftSdk

export type EidosGraftRepositorySession = PublishedRepositorySession &
  GraftMergeRepositorySession

export interface EidosGraftSdkModule extends Omit<
  PublishedGraftSdk,
  "RepositorySession"
> {
  RepositorySession: {
    new (target: string): EidosGraftRepositorySession
    open(
      target: string,
      options?: { signal?: AbortSignal }
    ): Promise<EidosGraftRepositorySession>
  }
}

const require = createRequire(import.meta.url)
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
    cachedModule = publishedGraftSdk as EidosGraftSdkModule
    return cachedModule
  }
  const sourceExecution =
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true" ||
    process.env.VITEST === "1" ||
    (process as NodeJS.Process & { defaultApp?: boolean }).defaultApp === true
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
