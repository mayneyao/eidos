import { BrowserWindow } from "electron"
import { randomUUID } from "node:crypto"
import { extensionHtml } from "@eidos.space/plugin-runtime/extension-sandbox"
import { SANDBOX_CSP } from "@eidos.space/plugin-runtime/sandbox"
import {
  matchingFileHooks,
  parseFileHookPlan,
  runFileHookInBrowser,
} from "@eidos.space/plugin-runtime/file-hooks"
import type { FileHookEvent, FileHookPlan } from "@eidos.space/plugin-sdk"
import type { PluginStore } from "./plugin-store"

/** Dedicated renderers isolate background plugin execution from the editor. */
export class PluginFileHooks {
  private closed = false
  private windows = new Set<BrowserWindow>()
  constructor(private readonly store: PluginStore) {}

  close() {
    this.closed = true
    for (const window of this.windows) window.destroy()
    this.windows.clear()
  }

  async run(
    spaceId: string,
    event: FileHookEvent
  ): Promise<FileHookPlan | null> {
    const plugins = (await this.store.list(spaceId)).plugins
      .filter((p) => p.enabled && matchingFileHooks(p.manifest, event).length)
      .sort((a, b) =>
        a.manifest.id < b.manifest.id
          ? -1
          : a.manifest.id > b.manifest.id
            ? 1
            : 0
      )
    for (const plugin of plugins) {
      for (const hook of matchingFileHooks(plugin.manifest, event)) {
        if (this.closed) return null
        const window = new BrowserWindow({
          show: false,
          webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            backgroundThrottling: false,
          },
        })
        this.windows.add(window)
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          const pkg = await this.store.read(plugin.hash)
          const html = extensionHtml(
            pkg.modules[pkg.manifest.extension!]!,
            (pkg.manifest.actions ?? []).map((a) => a.id),
            (pkg.manifest.formatters ?? []).map((f) => f.id),
            (pkg.manifest.hooks ?? []).map((h) => h.id)
          ).replace(
            "<head>",
            `<head><meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP.replace(
              /;\s*sandbox.*$/,
              ""
            )
              .replace("connect-src eidos-space-media:", "connect-src 'none'")
              .replaceAll('"', "&quot;")}">`
          )
          const input = {
            html,
            hook: hook.id,
            invocation: randomUUID(),
            actions: (pkg.manifest.actions ?? []).map((a) => a.id),
            formatters: (pkg.manifest.formatters ?? []).map((f) => f.id),
            hooks: (pkg.manifest.hooks ?? []).map((h) => h.id),
            event,
            settings: await this.store.pluginSettings(
              spaceId,
              plugin.manifest.id
            ),
            timeoutMs: 2000,
          }
          const result = await Promise.race([
            (async () => {
              await window.loadURL("eidos-plugin://file-hooks/index.html")
              return window.webContents.executeJavaScript(
                `(${runFileHookInBrowser.toString()})(${JSON.stringify(input)})`
              )
            })(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error("File hook timed out")),
                3000
              )
            }),
          ])
          const binding = await this.store.binding(plugin.manifest.id, spaceId)
          if (!binding?.enabled || binding.hash !== plugin.hash || this.closed)
            continue
          const plan = parseFileHookPlan(result, hook, event)
          // Stable first-writer ordering prevents two plugins from competing over one save.
          if (plan) return plan
        } catch (error) {
          console.warn(
            `eidos hook ${plugin.manifest.id}/${hook.id} skipped`,
            error
          )
        } finally {
          clearTimeout(timer)
          this.windows.delete(window)
          if (!window.isDestroyed()) window.destroy()
        }
      }
    }
    return null
  }
}
