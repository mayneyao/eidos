/**
 * DI Container - Inversify-based dependency injection container
 *
 * This is the core of the NestJS-style DI system for Electron.
 * It provides a singleton container that manages all service instances.
 */

import { Container } from "inversify"
import "reflect-metadata"

// Create the global container
export const container = new Container({
  defaultScope: "Singleton",
})

/**
 * Service identifier symbols
 * Use these to register and resolve services in the container
 */
export const TYPES = {
  // Services will be registered here
  ConfigManager: Symbol.for("ConfigManager"),
  ConfigService: Symbol.for("ConfigService"),
  FileSystemService: Symbol.for("FileSystemService"),
  SyncService: Symbol.for("SyncService"),
  DataSpaceService: Symbol.for("DataSpaceService"),
  SpaceRegistry: Symbol.for("SpaceRegistry"),
  CredentialsManager: Symbol.for("CredentialsManager"),
  AppLifecycleService: Symbol.for("AppLifecycleService"),
  AppUpdater: Symbol.for("AppUpdater"),
  ProtocolHandler: Symbol.for("ProtocolHandler"),
  WebviewService: Symbol.for("WebviewService"),
  TerminalService: Symbol.for("TerminalService"),
  ContextMenuService: Symbol.for("ContextMenuService"),
  FetchService: Symbol.for("FetchService"),
  LicenseService: Symbol.for("LicenseService"),
  RelayService: Symbol.for("RelayService"),
  CorsManager: Symbol.for("CorsManager"),
  OpenDataService: Symbol.for("OpenDataService"),
  SpaceManagementService: Symbol.for("SpaceManagementService"),
  BrowserViewManager: Symbol.for("BrowserViewManager"),
  GlobalShortcutManager: Symbol.for("GlobalShortcutManager"),
  // Window-related
  MainWindow: Symbol.for("MainWindow"),
} as const

/**
 * Get a service from the container
 */
export function getService<T>(
  identifier: symbol | (new (...args: any[]) => T)
): T {
  return container.get<T>(identifier as any)
}

/**
 * Check if a service is registered in the container
 */
export function isServiceRegistered(symbol: symbol): boolean {
  return container.isBound(symbol)
}
