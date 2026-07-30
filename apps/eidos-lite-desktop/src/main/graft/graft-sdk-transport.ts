import type { GraftSdkCommand } from "../../shared/graft-sdk-contracts"
import type {
  SpaceVersionTextContentDiff,
  SpaceVersionTextContentRequest,
} from "../../shared/contracts"

export interface GraftSdkTransport {
  readonly target: string | null
  open(root: string): Promise<void>
  reopen(): Promise<void>
  close(): Promise<void>
  command(
    command: GraftSdkCommand,
    args?: unknown[],
    options?: { signal?: AbortSignal }
  ): Promise<unknown>
  revisionTextDiff(
    request: SpaceVersionTextContentRequest
  ): Promise<SpaceVersionTextContentDiff>
  clone(
    targetDirectory: string,
    remoteUrl: string,
    token?: string
  ): Promise<unknown>
  terminateForTesting?(): Promise<void>
}
