/**
 * Network Module - HTTP fetch and network operations
 */

import { Module } from "../../common/di"
import { ConfigModule } from "../config/config.module"
import { FetchService } from "./fetch.service"
import { CorsService } from "./cors.service"

/**
 * Network Module
 *
 * Provides HTTP fetch capabilities, CORS handling, and AI model fetching.
 * Dependencies:
 * - ConfigModule: For security configuration (CORS domains)
 */
@Module({
  imports: [ConfigModule],
  providers: [FetchService, CorsService],
  exports: [FetchService, CorsService],
})
export class NetworkModule {}

export { FetchService } from "./fetch.service"
export { CorsService } from "./cors.service"
