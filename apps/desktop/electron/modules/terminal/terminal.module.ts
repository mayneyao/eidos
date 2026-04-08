/**
 * Terminal Module - Terminal session management using node-pty
 */

import { Module } from "../../common/di"
import { TerminalService, TerminalWindowProvider } from "./terminal.service"

/**
 * Terminal Module
 *
 * Provides terminal session management with PTY support.
 * Requires TerminalWindowProvider to be configured with window getter.
 */
@Module({
  providers: [TerminalService, TerminalWindowProvider],
  exports: [TerminalService, TerminalWindowProvider],
})
export class TerminalModule {}

export { TerminalService, TerminalWindowProvider } from "./terminal.service"
export type { TerminalSession, TerminalCreateOptions } from "./terminal.service"
