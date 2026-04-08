/**
 * Logger Service - Wrapper around electron-log with DI support
 *
 * This service provides a global logging interface that can be injected
 * into any other service. It's registered as a singleton in the DI container.
 */

import electronLog from "electron-log"
import { Injectable } from "../../common/di"

export interface Logger {
  info(...params: any[]): void
  warn(...params: any[]): void
  error(...params: any[]): void
  debug(...params: any[]): void
  verbose(...params: any[]): void
}

/**
 * Logger Service - Global logging service
 *
 * Usage:
 * ```typescript
 * @Injectable()
 * class MyService {
 *   constructor(@Inject(LoggerService) private logger: LoggerService) {}
 *
 *   doSomething() {
 *     this.logger.info("Doing something")
 *   }
 * }
 * ```
 */
@Injectable()
export class LoggerService implements Logger {
  private prefix: string = ""

  /**
   * Set a prefix for all log messages from this logger instance
   */
  setPrefix(prefix: string): void {
    this.prefix = prefix ? `[${prefix}] ` : ""
  }

  /**
   * Create a child logger with a specific prefix
   */
  child(prefix: string): LoggerService {
    const childLogger = new LoggerService()
    childLogger.setPrefix(prefix)
    return childLogger
  }

  info(...params: any[]): void {
    if (this.prefix) {
      electronLog.info(this.prefix, ...params)
    } else {
      electronLog.info(...params)
    }
  }

  warn(...params: any[]): void {
    if (this.prefix) {
      electronLog.warn(this.prefix, ...params)
    } else {
      electronLog.warn(...params)
    }
  }

  error(...params: any[]): void {
    if (this.prefix) {
      electronLog.error(this.prefix, ...params)
    } else {
      electronLog.error(...params)
    }
  }

  debug(...params: any[]): void {
    if (this.prefix) {
      electronLog.debug(this.prefix, ...params)
    } else {
      electronLog.debug(...params)
    }
  }

  verbose(...params: any[]): void {
    if (this.prefix) {
      // electron-log doesn't have verbose, use debug
      electronLog.debug(this.prefix, ...params)
    } else {
      electronLog.debug(...params)
    }
  }
}

/**
 * Logger token for injection
 * Can be used with @Inject(LOGGER_TOKEN) for interface-based injection
 */
export const LOGGER_TOKEN = Symbol.for("Logger")
