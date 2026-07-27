/**
 * Sync Module - Data synchronization services
 */

import { Module } from "../../common/di"
import { GraftCliProcessRunner } from "../space-versioning/graft-cli-runner"
import { GraftRunner } from "../space-versioning/graft-runner"
import { CredentialsManager } from "./credentials"
import { OfficialGraftRemoteService } from "./official-graft-remote"
import { SyncService } from "./sync.service"

@Module({
  providers: [
    SyncService,
    CredentialsManager,
    OfficialGraftRemoteService,
    GraftCliProcessRunner,
    GraftRunner,
  ],
  exports: [
    SyncService,
    CredentialsManager,
    OfficialGraftRemoteService,
    GraftCliProcessRunner,
    GraftRunner,
  ],
})
export class SyncModule {}

export { SyncService } from "./sync.service"
export { CredentialsManager, getCredentialsManager } from "./credentials"
export {
  EIDOS_GRAFT_REMOTE_ORIGIN,
  OfficialGraftRemoteService,
} from "./official-graft-remote"
