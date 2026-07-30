import type { App, WebContents } from "electron"

import type { EidosLiteLogLevel } from "../shared/contracts"
import { type EidosLiteLogger, installConsoleLogging } from "./logging"

function rendererLevel(
  level: Electron.WebContentsConsoleMessageEventParams["level"]
): EidosLiteLogLevel {
  if (level === "warning") return "warn"
  return level
}

function recordRendererConsole(
  logger: EidosLiteLogger,
  details: Electron.WebContentsConsoleMessageEventParams
): void {
  const context = {
    message: details.message,
    lineNumber: details.lineNumber,
    sourceUrl: details.sourceId,
  }
  const level = rendererLevel(details.level)
  logger.record(level, "renderer", "renderer.console", context)
}

function observeWebContents(
  webContents: WebContents,
  logger: EidosLiteLogger
): void {
  webContents.on("console-message", (details) => {
    if (details.level === "warning" || details.level === "error") {
      recordRendererConsole(logger, details)
    }
  })
  webContents.on("preload-error", (_event, preloadPath, error) => {
    logger.record(
      "error",
      "renderer",
      "renderer.preload.failed",
      { preloadPath, webContentsId: webContents.id },
      error
    )
  })
  webContents.on("render-process-gone", (_event, details) => {
    const level = details.reason === "clean-exit" ? "info" : "error"
    logger.record(level, "renderer", "renderer.process.gone", {
      webContentsId: webContents.id,
      reason: details.reason,
      exitCode: details.exitCode,
    })
  })
  webContents.on("unresponsive", () => {
    logger.record("warn", "renderer", "renderer.unresponsive", {
      webContentsId: webContents.id,
    })
  })
}

export function installElectronLogging(
  app: App,
  logger: EidosLiteLogger
): () => void {
  const restoreConsole = installConsoleLogging(logger)
  const onWebContentsCreated = (
    _event: Electron.Event,
    webContents: WebContents
  ) => observeWebContents(webContents, logger)
  const onChildProcessGone = (
    _event: Electron.Event,
    details: Electron.Details
  ) => {
    const level = details.reason === "clean-exit" ? "info" : "error"
    logger[level]("electron.child-process.gone", {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
      serviceName: details.serviceName,
      name: details.name,
    })
  }
  const onUncaughtException = (error: Error, origin: string) => {
    logger.error("process.uncaught-exception", { origin }, error)
  }

  app.on("web-contents-created", onWebContentsCreated)
  app.on("child-process-gone", onChildProcessGone)
  process.on("uncaughtExceptionMonitor", onUncaughtException)

  return () => {
    restoreConsole()
    app.off("web-contents-created", onWebContentsCreated)
    app.off("child-process-gone", onChildProcessGone)
    process.off("uncaughtExceptionMonitor", onUncaughtException)
  }
}
