/**
 * Context Menu Module - Native context menu management
 */

import { Module } from "../../common/di"
import { ContextMenuService } from "./context-menu.service"

/**
 * Context Menu Module
 *
 * Provides native context menu display functionality.
 * No external dependencies - completely self-contained.
 */
@Module({
  providers: [ContextMenuService],
  exports: [ContextMenuService],
})
export class ContextMenuModule {}

export { ContextMenuService, type NativeMenuItem } from "./context-menu.service"
