/**
 * Sync Module - Data synchronization services
 */

import { Module } from "../../common/di"
import { SyncService } from "./sync.service"
import { CredentialsManager } from "./credentials"

@Module({
  providers: [SyncService, CredentialsManager],
  exports: [SyncService, CredentialsManager],
})
export class SyncModule {}

export { SyncService } from "./sync.service"
export { CredentialsManager } from "./credentials"
