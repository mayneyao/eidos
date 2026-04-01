import { WebContentsView } from "electron"
import type { BrowserWindow } from "electron"

export interface PipelineContext {
  args: Record<string, any>
  lastResult: any
}

export type PipelineStep =
  | {
      type: "navigate"
      url: string
      settleMs?: number
    }
  | {
      type: "evaluate"
      script: string
    }
  | {
      type: "wait"
      ms: number
    }

function renderTemplate(template: string, ctx: PipelineContext): string {
  return template.replace(/\$\{\{\s*([^}]+)\s*\}\}/g, (_, expr) => {
    const trimmed = expr.trim()
    const parts = trimmed.split(".")
    let value: any = ctx
    for (const part of parts) {
      value = value?.[part]
      if (value === undefined) break
    }
    return value !== undefined ? String(value) : _
  })
}

function renderStep(step: PipelineStep, ctx: PipelineContext): PipelineStep {
  if (step.type === "navigate") {
    return { ...step, url: renderTemplate(step.url, ctx) }
  }
  if (step.type === "evaluate") {
    return { ...step, script: renderTemplate(step.script, ctx) }
  }
  return step
}

export class PipelineRunner {
  private win: BrowserWindow

  constructor(win: BrowserWindow) {
    this.win = win
  }

  async run(
    steps: PipelineStep[],
    args: Record<string, any> = {},
    options: { debug?: boolean } = {}
  ): Promise<{ result: any; logs: string[]; rendererLogs: string[] }> {
    const logs: string[] = []
    const rendererLogs: string[] = []
    const ctx: PipelineContext = { args, lastResult: undefined }

    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })

    // Run off-screen
    view.setBounds({ x: -10000, y: -10000, width: 1280, height: 720 })
    this.win.contentView.addChildView(view)

    // Capture renderer console logs
    view.webContents.on(
      "console-message",
      (_, level, message, line, sourceId) => {
        const levelStr = ["debug", "log", "warn", "error"][level] ?? "log"
        const entry =
          `[renderer:${levelStr}] ${message}` +
          (sourceId ? ` (${sourceId}:${line})` : "")
        rendererLogs.push(entry)
      }
    )

    if (options.debug) {
      view.webContents.openDevTools({ mode: "detach" })
    }

    const log = (msg: string) => {
      logs.push(msg)
      console.log(`[PipelineRunner] ${msg}`)
    }

    try {
      for (let i = 0; i < steps.length; i++) {
        const rawStep = steps[i]
        const step = renderStep(rawStep, ctx)
        log(`Step ${i + 1}/${steps.length}: ${step.type}`)

        if (step.type === "navigate") {
          await view.webContents.loadURL(step.url)
          if (step.settleMs && step.settleMs > 0) {
            log(`  wait settle ${step.settleMs}ms`)
            await new Promise((r) => setTimeout(r, step.settleMs))
          } else {
            await this.waitForLoad(view)
          }
        } else if (step.type === "wait") {
          await new Promise((r) => setTimeout(r, step.ms))
        } else if (step.type === "evaluate") {
          const script = (step.script || "").trim()
          const isIife = script.endsWith(")()")
          const wrappedScript = isIife
            ? `
            (async () => {
              try {
                return await ${script};
              } catch (err) {
                const errorObj = {
                  __pipeline_error__: true,
                  message: err?.message || String(err),
                  stack: err?.stack || '',
                };
                throw new Error(JSON.stringify(errorObj));
              }
            })()
          `
            : `
            (async () => {
              try {
                ${script}
              } catch (err) {
                const errorObj = {
                  __pipeline_error__: true,
                  message: err?.message || String(err),
                  stack: err?.stack || '',
                };
                throw new Error(JSON.stringify(errorObj));
              }
            })()
          `
          try {
            ctx.lastResult = await view.webContents.executeJavaScript(
              wrappedScript,
              true
            )
            log(
              `  evaluate returned: ${JSON.stringify(ctx.lastResult).slice(0, 200)}`
            )
          } catch (execError) {
            const msg =
              execError instanceof Error ? execError.message : String(execError)
            // Try to extract the original renderer error
            let parsed: any = null
            try {
              const match = msg.match(/Error: ({"__pipeline_error__":true.*?})/)
              if (match) {
                parsed = JSON.parse(match[1])
              }
            } catch {}

            if (parsed?.__pipeline_error__) {
              const detail =
                `Renderer error: ${parsed.message}` +
                (parsed.stack ? `\n${parsed.stack}` : "")
              log(detail)
              throw new Error(detail)
            }
            throw execError
          }
        }
      }

      return { result: ctx.lastResult, logs, rendererLogs }
    } catch (error) {
      log(`Error: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    } finally {
      this.win.contentView.removeChildView(view)
      view.webContents.close()
      log("Cleaned up WebContentsView")
    }
  }

  private waitForLoad(view: WebContentsView): Promise<void> {
    return new Promise((resolve) => {
      if (view.webContents.isLoadingMainFrame()) {
        view.webContents.once("did-finish-load", () => resolve())
      } else {
        resolve()
      }
    })
  }
}
