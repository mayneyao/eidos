import type { GraftSdkCommand } from "../../shared/graft-sdk-contracts"

export interface GraftSdkTransport {
  readonly target: string | null
  open(root: string): Promise<void>
  reopen(): Promise<void>
  close(): Promise<void>
  command(command: GraftSdkCommand, args?: unknown[]): Promise<unknown>
  clone(
    targetDirectory: string,
    remoteUrl: string,
    token?: string
  ): Promise<unknown>
  terminateForTesting?(): Promise<void>
}
