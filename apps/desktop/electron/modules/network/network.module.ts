/**
 * Network Module - HTTP fetch and network operations
 */

import { Module } from "../../common/di"
import { FetchService } from "./fetch.service"

/**
 * Network Module
 *
 * Provides HTTP fetch capabilities and AI model fetching.
 * No external dependencies - completely self-contained.
 */
@Module({
  providers: [FetchService],
  exports: [FetchService],
})
export class NetworkModule {}

export { FetchService } from "./fetch.service"
