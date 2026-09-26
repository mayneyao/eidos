import path from "node:path"
import { assertPluginCompatibility } from "@eidos.space/plugin-runtime/compatibility"
import fsSync from "node:fs"
import fs from "node:fs/promises"
import os from "node:os"
import { watch, type FSWatcher } from "chokidar"
import { SANDBOX_CSP } from "@eidos.space/plugin-runtime/sandbox"
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  protocol,
  safeStorage,
  type IpcMainInvokeEvent,
} from "electron"
import {
  decodePackage,
  encodePackage,
} from "@eidos.space/plugin-runtime/package"
import { PluginError, parseChange } from "@eidos.space/plugin-runtime/rpc"
import { PLUGIN_CHANNELS } from "../../shared/plugins"
import type { WindowController } from "../window-controller"
import { PluginStore } from "./plugin-store"
import { PluginService } from "./plugin-service"
import { PluginConnections } from "./plugin-connections"
import { PluginRegistry } from "./plugin-registry"
import {
  ensureOwnerOnlyDirectory,
  migrateLegacyPluginsDirectory,
  resolveEidosHome,
} from "../eidos-home"

export const PLUGIN_CSP = SANDBOX_CSP

async function compilePluginSource(source: string) {
  const { compilePlugin } = await import("@eidos.space/plugin-runtime/compiler")
  return compilePlugin(source)
}

export function registerPluginIpc(controller: WindowController): {
  close(): void
  verifyPackagedSmoke(): Promise<void>
} {
  const home = resolveEidosHome({
    env: process.env,
    homeDirectory: os.homedir(),
    userDataPath: app.getPath("userData"),
    defaultUserDataPath: path.join(app.getPath("appData"), app.getName()),
  })
  if (home.legacyPlugins) {
    try {
      const migration = migrateLegacyPluginsDirectory(
        fsSync,
        home.legacyPlugins,
        home.plugins
      )
      if (migration === "migrated")
        console.log(`eidos plugins migrated to ${home.plugins}`)
    } catch (error) {
      console.error(
        "eidos plugin migration failed; keeping the existing store",
        error
      )
    }
  }
  // Isolated dev/smoke profiles own their Electron directory already; only the
  // real Eidos home needs an owner-only permission guarantee.
  if (home.source !== "profile") ensureOwnerOnlyDirectory(fsSync, home.home)
  const store = new PluginStore(home.plugins)
  const registry = new PluginRegistry(store.directory)
  const connections = new PluginConnections(
    path.join(store.directory, "credentials"),
    {
      available: () =>
        safeStorage.isEncryptionAvailable() &&
        safeStorage.getSelectedStorageBackend?.() !== "basic_text",
      encrypt: (value) => safeStorage.encryptString(value),
      decrypt: (value) => safeStorage.decryptString(value),
    }
  )
  const connectionRequests = new Map<string, Set<AbortController>>()
  const service = new PluginService(store, (owner, ticket) => {
    const target = BrowserWindow.getAllWindows().find(
      (window) => window.webContents.id === owner
    )
    if (target && !target.webContents.isDestroyed())
      target.webContents.send(PLUGIN_CHANNELS.event, {
        ticket,
        event: {
          protocol: "eidos-plugin",
          apiVersion: 1,
          observation: "host.closed",
          value: null,
        },
      })
  })
  const owners = new Set<number>()
  const watchers = new Map<string, FSWatcher>()
  const pendingReloads = new Map<
    string,
    {
      pluginId: string
      owners: Set<number>
      timer: ReturnType<typeof setTimeout>
    }
  >()
  protocol.handle("eidos-plugin", (request) => {
    const html = service.html(request.url)
    return new Response(html ?? "Plugin instance is closed", {
      status: html === null ? 404 : 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": service.csp(request.url),
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      },
    })
  })
  function caller(event: IpcMainInvokeEvent) {
    if (event.senderFrame !== event.sender.mainFrame)
      throw new PluginError(
        "PERMISSION_DENIED",
        "Only the workbench can manage plugins"
      )
    if (!owners.has(event.sender.id)) {
      owners.add(event.sender.id)
      const owner = event.sender.id
      event.sender.once("destroyed", () => {
        service.closeOwner(owner)
        owners.delete(owner)
      })
    }
    return event.sender.id
  }
  function catalogChanged() {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed())
        window.webContents.send(PLUGIN_CHANNELS.event, {
          ticket: "",
          event: {
            protocol: "eidos-plugin",
            apiVersion: 1,
            observation: "host.catalog",
            value: null,
          },
        })
    }
  }
  function clearReloads(id: string) {
    for (const [hash, pending] of pendingReloads) {
      if (pending.pluginId !== id) continue
      clearTimeout(pending.timer)
      pendingReloads.delete(hash)
    }
  }
  function reloadPlugin(id: string) {
    const instances = [...service.instances].filter(
      ([, instance]) => instance.pluginId === id
    )
    service.revoke(id)
    for (const [ticket, instance] of instances) {
      const window = BrowserWindow.getAllWindows().find(
        (window) => window.webContents.id === instance.owner
      )
      window?.webContents.send(PLUGIN_CHANNELS.event, {
        ticket,
        event: {
          protocol: "eidos-plugin",
          apiVersion: 1,
          observation: "host.reload",
          value: null,
        },
      })
    }
  }
  const currentSpace = (event: IpcMainInvokeEvent) => {
    try {
      return controller.requireSession(event.sender).canonical.id
    } catch {
      return undefined
    }
  }
  ipcMain.handle(PLUGIN_CHANNELS.list, (event) => {
    caller(event)
    return store.list(currentSpace(event))
  })
  ipcMain.handle(PLUGIN_CHANNELS.settings, (event, id: unknown) => {
    caller(event)
    const spaceId = currentSpace(event)
    if (!spaceId || typeof id !== "string")
      throw new PluginError(
        "INVALID_REQUEST",
        "Invalid plugin settings request"
      )
    return store.pluginSettings(spaceId, id)
  })
  ipcMain.handle(
    PLUGIN_CHANNELS.setSetting,
    (event, id: unknown, key: unknown, value: unknown) => {
      caller(event)
      const spaceId = currentSpace(event)
      if (
        !spaceId ||
        typeof id !== "string" ||
        typeof key !== "string" ||
        !(
          value === null ||
          ["string", "boolean", "number"].includes(typeof value)
        )
      )
        throw new PluginError("INVALID_REQUEST", "Invalid plugin setting")
      return store.setPluginSetting(
        spaceId,
        id,
        key,
        value as string | boolean | number | null
      )
    }
  )
  ipcMain.handle(PLUGIN_CHANNELS.marketplace, (event, refresh: unknown) => {
    caller(event)
    if (refresh !== undefined && typeof refresh !== "boolean")
      throw new Error("Invalid refresh request")
    return registry.list(refresh === true)
  })
  ipcMain.handle(PLUGIN_CHANNELS.readme, async (event, id: unknown) => {
    caller(event)
    if (typeof id !== "string" || !id || id.length > 128)
      throw new PluginError("INVALID_REQUEST", "Invalid plugin")
    return registry.readme(id)
  })
  ipcMain.handle(
    PLUGIN_CHANNELS.table,
    (event, key: unknown, tableId: unknown, viewId: unknown) => {
      const owner = caller(event)
      if (
        typeof key !== "string" ||
        typeof tableId !== "string" ||
        typeof viewId !== "string" ||
        !tableId ||
        !viewId ||
        tableId.length > 128 ||
        viewId.length > 128
      )
        throw new PluginError("INVALID_REQUEST", "Invalid table view")
      return service.openPage(
        owner,
        controller.requireSession(event.sender),
        key,
        "",
        { tableId, viewId }
      )
    }
  )
  ipcMain.handle(PLUGIN_CHANNELS.shortcuts, (event, bindings: unknown) => {
    caller(event)
    return controller.setPluginShortcuts(event.sender, bindings)
  })
  ipcMain.handle(
    PLUGIN_CHANNELS.page,
    (event, key: unknown, route: unknown) => {
      const owner = caller(event)
      if (
        typeof key !== "string" ||
        (route !== undefined && typeof route !== "string")
      )
        throw new PluginError("INVALID_REQUEST", "Invalid page")
      return service.openPage(
        owner,
        controller.requireSession(event.sender),
        key,
        route
      )
    }
  )
  ipcMain.handle(
    PLUGIN_CHANNELS.connection,
    async (
      event,
      ticket: string,
      id: string,
      operation: string,
      value: unknown
    ) => {
      const owner = caller(event)
      if (typeof ticket !== "string" || typeof id !== "string")
        throw new Error("Invalid connection")
      const access = await service.connectionAccess(
        owner,
        controller.requireSession(event.sender),
        ticket,
        id,
        operation === "status" ||
          operation === "save" ||
          operation === "configure"
      )
      if (operation === "status")
        return access.configurable
          ? connections.configuration(access.scope)
          : connections.configured(access.scope)
      if (operation === "configure") {
        if (!access.configurable)
          throw new Error("Connection is not configurable")
        return connections.configure(access.scope, value)
      }
      if (operation === "save") {
        if (access.configurable) throw new Error("Use connection configuration")
        if (value !== null && typeof value !== "string")
          throw new Error("Invalid credential")
        return connections.save(access.scope, value)
      }
      if (operation === "cancel") {
        for (const pending of connectionRequests.get(ticket) ?? [])
          pending.abort()
        return
      }
      if (
        operation !== "request" ||
        (connectionRequests.get(ticket)?.size ?? 0) >= 2
      )
        throw new Error("Invalid or busy connection request")
      const pending = new AbortController()
      const requests =
        connectionRequests.get(ticket) ?? new Set<AbortController>()
      requests.add(pending)
      connectionRequests.set(ticket, requests)
      try {
        return await connections.request(
          access.scope,
          access.url,
          value,
          AbortSignal.any([access.signal, pending.signal]),
          access.configurable,
          ticket
        )
      } finally {
        requests.delete(pending)
        if (!requests.size) connectionRequests.delete(ticket)
      }
    }
  )
  ipcMain.handle(
    PLUGIN_CHANNELS.extension,
    (event, id: unknown, table?: { tableId: string; viewId: string }) => {
      const owner = caller(event)
      if (typeof id !== "string")
        throw new PluginError("INVALID_REQUEST", "Invalid plugin")
      if (
        table &&
        (typeof table.tableId !== "string" ||
          typeof table.viewId !== "string" ||
          table.tableId.length > 128 ||
          table.viewId.length > 128)
      )
        throw new PluginError("INVALID_REQUEST", "Invalid table binding")
      return service.openExtension(
        owner,
        controller.requireSession(event.sender),
        id,
        table
      )
    }
  )
  ipcMain.handle(
    PLUGIN_CHANNELS.defaultFormatter,
    async (event, extension: unknown, key: unknown) => {
      caller(event)
      if (
        typeof extension !== "string" ||
        (key !== null && typeof key !== "string")
      )
        throw new PluginError("INVALID_REQUEST", "Invalid formatter default")
      await store.setDefaultFormatter(
        extension,
        key,
        controller.requireSession(event.sender).canonical.id
      )
      catalogChanged()
    }
  )
  ipcMain.handle(
    PLUGIN_CHANNELS.formatter,
    (
      event,
      ticket: unknown,
      formatter: unknown,
      file: unknown,
      draft: unknown,
      version: unknown
    ) => {
      const owner = caller(event)
      if (
        typeof ticket !== "string" ||
        typeof formatter !== "string" ||
        typeof file !== "string" ||
        typeof version !== "string" ||
        version.length > 128
      )
        throw new PluginError("INVALID_REQUEST", "Invalid formatter invocation")
      return service.invoke(
        owner,
        controller.requireSession(event.sender),
        ticket,
        formatter,
        file,
        draft === undefined ? undefined : parseChange(draft),
        (value) => {
          if (!event.sender.isDestroyed())
            event.sender.send(PLUGIN_CHANNELS.event, { ticket, event: value })
        },
        true,
        version
      )
    }
  )
  ipcMain.handle(
    PLUGIN_CHANNELS.formatterContext,
    (event, path: unknown, version: unknown) => {
      const owner = caller(event)
      if (
        (path !== null && typeof path !== "string") ||
        typeof version !== "string" ||
        version.length > 128
      )
        throw new PluginError("INVALID_REQUEST", "Invalid formatter context")
      service.setFormatterContext(
        owner,
        controller.requireSession(event.sender),
        path,
        version
      )
    }
  )
  ipcMain.handle(
    PLUGIN_CHANNELS.invoke,
    (
      event,
      ticket: unknown,
      action: unknown,
      file: unknown,
      draft: unknown
    ) => {
      const owner = caller(event)
      if (
        typeof ticket !== "string" ||
        typeof action !== "string" ||
        (file !== undefined && typeof file !== "string")
      )
        throw new PluginError("INVALID_REQUEST", "Invalid action invocation")
      return service.invoke(
        owner,
        controller.requireSession(event.sender),
        ticket,
        action,
        file,
        draft === undefined ? undefined : parseChange(draft),
        (value) => {
          if (!event.sender.isDestroyed())
            event.sender.send(PLUGIN_CHANNELS.event, { ticket, event: value })
        }
      )
    }
  )
  ipcMain.handle(
    PLUGIN_CHANNELS.install,
    async (
      event,
      development: unknown,
      marketplaceId: unknown,
      droppedPath: unknown
    ) => {
      caller(event)
      const spaceId = currentSpace(event)
      if (
        droppedPath !== undefined &&
        (typeof droppedPath !== "string" ||
          !path.isAbsolute(droppedPath) ||
          path.extname(droppedPath).toLowerCase() !== ".eidos-plugin" ||
          development ||
          marketplaceId !== undefined)
      )
        throw new PluginError("INVALID_REQUEST", "Invalid dropped plugin file")
      if (development !== undefined && typeof development !== "boolean")
        throw new PluginError("INVALID_REQUEST", "Invalid development mode")
      if (
        marketplaceId !== undefined &&
        (typeof marketplaceId !== "string" ||
          marketplaceId.length > 128 ||
          development)
      )
        throw new PluginError("INVALID_REQUEST", "Invalid marketplace plugin")
      const owner = BrowserWindow.fromWebContents(event.sender)
      if (!owner)
        throw new PluginError("INSTANCE_CLOSED", "Workbench is closed")
      const marketplaceBytes =
        typeof marketplaceId === "string"
          ? await (async () => {
              const bytes = await registry.download(
                marketplaceId,
                (loaded, total) => {
                  if (
                    typeof event.sender.send === "function" &&
                    !event.sender.isDestroyed()
                  ) {
                    event.sender.send(PLUGIN_CHANNELS.installProgress, {
                      id: marketplaceId,
                      phase: "downloading",
                      loaded,
                      total,
                      percent:
                        total > 0
                          ? Math.min(100, Math.round((loaded / total) * 100))
                          : 0,
                    })
                  }
                }
              )
              if (
                typeof event.sender.send === "function" &&
                !event.sender.isDestroyed()
              ) {
                event.sender.send(PLUGIN_CHANNELS.installProgress, {
                  id: marketplaceId,
                  phase: "installing",
                  percent: 100,
                })
              }
              return bytes
            })()
          : undefined
      const selected = marketplaceBytes
        ? { canceled: false, filePaths: [""] }
        : typeof droppedPath === "string"
          ? { canceled: false, filePaths: [droppedPath] }
          : await dialog.showOpenDialog(owner, {
              title: development
                ? "Load development source (plugin.json or TS/JS)"
                : "Install plugin",
              properties: ["openFile"],
              filters: [
                {
                  name: "Eidos Plugin",
                  extensions: development
                    ? ["json", "ts", "js", "tsx", "jsx"]
                    : ["eidos-plugin"],
                },
              ],
            })
      if (selected.canceled || (!marketplaceBytes && !selected.filePaths[0]))
        return false
      const source =
        path.basename(selected.filePaths[0]) === "plugin.json"
          ? path.dirname(selected.filePaths[0])
          : selected.filePaths[0]
      const compiled = development
        ? await compilePluginSource(source)
        : undefined
      const bytes =
        marketplaceBytes ??
        compiled?.bytes ??
        (await store.readBytes(selected.filePaths[0]))
      const pkg = decodePackage(bytes)
      assertPluginCompatibility(pkg.manifest, "eidos-lite")
      if (Object.keys(pkg.manifest.resources ?? {}).length)
        throw new PluginError(
          "UNSUPPORTED_API",
          "Named resources are not connected yet"
        )
      const existing = await store.installed(pkg.manifest.id)
      let existingVersion: string | undefined
      if (existing) {
        try {
          existingVersion = (await store.read(existing.hash)).manifest.version
        } catch {
          // Ignore if previous package cannot be read
        }
      }
      const isUpdate = !!existing
      const versionLabel =
        existingVersion && existingVersion !== pkg.manifest.version
          ? `${existingVersion} → ${pkg.manifest.version}`
          : pkg.manifest.version

      const themeReview = pkg.manifest.theme
        ? `This package changes Eidos Lite's colors, typography and supported layout tokens when selected. It contains no executable plugin code. Installed once for this device; choose Apply theme in the plugin manager after installation.`
        : null

      const review = await dialog.showMessageBox(owner, {
        type: "question",
        title: isUpdate ? "Update plugin" : "Install plugin",
        message: `${pkg.manifest.name} ${versionLabel}${
          Object.values(pkg.manifest.connections ?? {}).length
            ? `\nAuthenticated connections: ${Object.values(
                pkg.manifest.connections ?? {}
              )
                .map((c) =>
                  c.configurable
                    ? `${c.title}: user-configurable HTTPS endpoint`
                    : c.url
                )
                .join(", ")}`
            : ""
        }${pkg.manifest.browser?.networkOrigins?.length ? `\nNetwork access: ${pkg.manifest.browser.networkOrigins.join(", ")}` : ""}${pkg.manifest.browser?.workers ? "\nRuns bundled browser workers." : ""}${pkg.manifest.storage ? `\nDevice-local plugin storage: up to ${Math.ceil(pkg.manifest.storage.maxBytes / 1024 / 1024)} MiB.` : ""}`,
        detail: themeReview
          ? `${pkg.manifest.id}\n\n${themeReview}`
          : `${pkg.manifest.id}\n\n${isUpdate ? "Updating replaces the installed version on this device." : "Installed once for this device."} ${spaceId ? (isUpdate ? "Remains enabled or disabled as configured for this Space." : "Enable in this Space after installation.") : "Open a Space to enable it."} Updates apply to every Space using this plugin.\n\n${[...(pkg.manifest.views ?? []), ...(pkg.manifest.actions ?? [])].some((item) => item.access === "write") ? "This plugin can read and modify documents opened with its views or selected for its actions." : "This plugin can read documents opened with its views or selected for its actions."}${pkg.manifest.workspace?.files ? (pkg.manifest.workspace.files === true || (typeof pkg.manifest.workspace.files === "object" && pkg.manifest.workspace.files.write) ? "\nThis plugin can read and write files throughout this Space." : "\nThis plugin can read files throughout this Space.") : ""}${pkg.manifest.formatters?.length ? "\nIts formatters receive the selected document text. Eidos applies their results as undoable draft changes without saving." : ""}\nNamed resources are not granted by installation.`,
        buttons: isUpdate ? ["Cancel", "Update"] : ["Cancel", "Install"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      })
      if (review.response !== 1) return false
      if (currentSpace(event) !== spaceId)
        throw new PluginError(
          "INSTANCE_CLOSED",
          "Space changed during installation"
        )
      const key = pkg.manifest.id
      await watchers.get(key)?.close()
      watchers.delete(key)
      clearReloads(key)
      const hash = await store.install(bytes, spaceId)
      reloadPlugin(pkg.manifest.id)
      catalogChanged()
      if (development && compiled) {
        store.development.set(hash, source)
        const sourceRoot = (await fs.stat(source)).isDirectory()
          ? source
          : path.dirname(source)
        const watcher = watch([sourceRoot, ...compiled.dependencies], {
          ignoreInitial: true,
          ignored: (file) =>
            file
              .split(path.sep)
              .some((part) => part === ".git" || part === "dist"),
        })
        watchers.set(key, watcher)
        let timer: ReturnType<typeof setTimeout> | undefined,
          running = false,
          again = false
        const rebuild = async () => {
          if (watchers.get(key) !== watcher) return
          if (running) {
            again = true
            return
          }
          running = true
          try {
            do {
              again = false
              try {
                const next = await compilePluginSource(source)
                if (watchers.get(key) !== watcher) return
                if (
                  JSON.stringify(next.program.manifest) !==
                  JSON.stringify(pkg.manifest)
                )
                  throw new Error(
                    "Declaration changed. Load the development source again to review its authority."
                  )
                const current = await store.installed(pkg.manifest.id)
                if (!current) return
                const updated = await store.install(
                  next.bytes,
                  undefined,
                  false
                )
                if (watchers.get(key) !== watcher) {
                  store.discardTrial(pkg.manifest.id, updated)
                  return
                }
                store.development.set(updated, source)
                watcher.add(next.dependencies)
                const reloadOwners = new Set<number>()
                for (const [ticket, instance] of [...service.instances]) {
                  if (instance.pluginId !== pkg.manifest.id) continue
                  if (
                    (
                      await store.binding(
                        instance.pluginId,
                        instance.session.canonical.id
                      )
                    )?.hash !== updated
                  )
                    continue
                  const window = BrowserWindow.getAllWindows().find(
                    (window) => window.webContents.id === instance.owner
                  )
                  reloadOwners.add(instance.owner)
                  window?.webContents.send(PLUGIN_CHANNELS.event, {
                    ticket,
                    event: {
                      protocol: "eidos-plugin",
                      apiVersion: 1,
                      observation: "host.reload",
                      value: null,
                    },
                  })
                }
                if (reloadOwners.size) {
                  const timer = setTimeout(() => {
                    pendingReloads.delete(updated)
                    void (async () => {
                      if (
                        (await store.installed(pkg.manifest.id))?.hash !==
                        updated
                      )
                        return
                      const previous = await store.readBytes(
                        path.join(
                          store.directory,
                          "packages",
                          `${current.hash}.eidos-plugin`
                        )
                      )
                      await store.install(previous, undefined, false)
                      for (const window of BrowserWindow.getAllWindows())
                        if (reloadOwners.has(window.webContents.id))
                          window.webContents.send(PLUGIN_CHANNELS.event, {
                            ticket: "",
                            event: {
                              protocol: "eidos-plugin",
                              apiVersion: 1,
                              observation: "host.rollback",
                              value: pkg.manifest.id,
                            },
                          })
                      for (const [ticket, instance] of service.instances)
                        if (instance.hash === updated) {
                          const window = BrowserWindow.getAllWindows().find(
                            (window) => window.webContents.id === instance.owner
                          )
                          window?.webContents.send(PLUGIN_CHANNELS.event, {
                            ticket,
                            event: {
                              protocol: "eidos-plugin",
                              apiVersion: 1,
                              observation: "host.reload",
                              value: null,
                            },
                          })
                        }
                    })().catch(() => {})
                  }, 10000)
                  const old = pendingReloads.get(updated)
                  if (old) clearTimeout(old.timer)
                  pendingReloads.set(updated, {
                    pluginId: pkg.manifest.id,
                    owners: reloadOwners,
                    timer,
                  })
                }
              } catch (error) {
                if (!owner.isDestroyed())
                  owner.webContents.send(PLUGIN_CHANNELS.event, {
                    ticket: "",
                    event: {
                      protocol: "eidos-plugin",
                      apiVersion: 1,
                      observation: "host.diagnostic",
                      value:
                        error instanceof Error
                          ? error.message
                          : "Source compilation failed",
                    },
                  })
              }
            } while (again)
          } finally {
            running = false
          }
        }
        watcher.on("all", () => {
          clearTimeout(timer)
          timer = setTimeout(() => {
            void rebuild()
          }, 150)
        })
        watcher.on("error", () => {
          void watcher.close()
          watchers.delete(key)
        })
      }
      return true
    }
  )
  ipcMain.handle(PLUGIN_CHANNELS.uninstall, async (event, id: unknown) => {
    caller(event)
    if (typeof id !== "string")
      throw new PluginError("INVALID_REQUEST", "Invalid plugin")
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner) throw new PluginError("INSTANCE_CLOSED", "Workbench is closed")
    const installed = await store.installed(id)
    if (!installed) return false
    const { manifest } = await store.read(installed.hash)
    const review = await dialog.showMessageBox(owner, {
      type: "question",
      title: "Uninstall plugin",
      message: `Uninstall ${manifest.name}?`,
      detail: manifest.theme
        ? "This removes the theme from this device. Eidos Lite returns to its default appearance if this theme is active."
        : "This removes the plugin from every Space on this device and revokes its resource grants. Your documents are kept.",
      buttons: ["Cancel", "Uninstall"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    })
    if (review.response !== 1) return false
    if ((await store.installed(id))?.hash !== installed.hash)
      throw new PluginError(
        "STALE_REVISION",
        "Plugin changed while uninstalling; try again"
      )
    await watchers.get(id)?.close()
    watchers.delete(id)
    clearReloads(id)
    service.revoke(id)
    await store.uninstall(id)
    catalogChanged()
    return true
  })
  ipcMain.handle(
    PLUGIN_CHANNELS.enable,
    async (event, id: unknown, enabled: unknown) => {
      caller(event)
      const spaceId = controller.requireSession(event.sender).canonical.id
      if (typeof id !== "string" || typeof enabled !== "boolean")
        throw new PluginError("INVALID_REQUEST", "Invalid plugin binding")
      await store.enable(id, enabled, spaceId)
      service.revoke(id, spaceId)
      catalogChanged()
    }
  )
  ipcMain.handle(PLUGIN_CHANNELS.selectTheme, async (event, id: unknown) => {
    caller(event)
    if (id !== null && typeof id !== "string")
      throw new PluginError("INVALID_REQUEST", "Invalid theme selection")
    await store.selectTheme(id)
    catalogChanged()
  })
  ipcMain.handle(
    PLUGIN_CHANNELS.associate,
    async (event, extension: unknown, editor: unknown) => {
      caller(event)
      if (
        typeof extension !== "string" ||
        (editor !== null && typeof editor !== "string")
      )
        throw new PluginError("INVALID_REQUEST", "Invalid association")
      await store.associate(extension, editor)
    }
  )
  ipcMain.handle(PLUGIN_CHANNELS.editors, (event, file: unknown) => {
    caller(event)
    if (typeof file !== "string")
      throw new PluginError("INVALID_REQUEST", "Invalid path")
    return store.editors(file, currentSpace(event))
  })
  ipcMain.handle(
    PLUGIN_CHANNELS.open,
    (event, file: unknown, explicit: unknown, draft: unknown) => {
      const owner = caller(event)
      if (
        typeof file !== "string" ||
        (explicit !== undefined && typeof explicit !== "string")
      )
        throw new PluginError("INVALID_REQUEST", "Invalid editor selection")
      return service.open(
        owner,
        controller.requireSession(event.sender),
        file,
        explicit,
        draft === undefined ? undefined : parseChange(draft)
      )
    }
  )
  ipcMain.handle(
    PLUGIN_CHANNELS.request,
    async (event, ticket: unknown, request: unknown) => {
      const owner = caller(event)
      if (typeof ticket !== "string")
        throw new PluginError("INVALID_REQUEST", "Invalid plugin ticket")
      const result = await service.request(
        owner,
        controller.requireSession(event.sender),
        ticket,
        request,
        (value) => {
          if (!event.sender.isDestroyed())
            event.sender.send(PLUGIN_CHANNELS.event, { ticket, event: value })
        }
      )
      if (
        request &&
        typeof request === "object" &&
        "method" in request &&
        (request.method === "extension.ready" ||
          (request.method === "view.ready" &&
            !service.instances.get(ticket)?.extension)) &&
        "result" in result.response
      ) {
        const instance = service.instances.get(ticket)
        const pending = instance && pendingReloads.get(instance.hash)
        if (pending) {
          pending.owners.delete(owner)
          if (!pending.owners.size) {
            clearTimeout(pending.timer)
            pendingReloads.delete(instance!.hash)
          }
        }
      }
      return result
    }
  )
  ipcMain.handle(PLUGIN_CHANNELS.close, (event, ticket: unknown) => {
    const owner = caller(event)
    if (typeof ticket === "string") service.close(owner, ticket)
  })
  return {
    close() {
      for (const channel of Object.values(PLUGIN_CHANNELS))
        ipcMain.removeHandler(channel)
      protocol.unhandle("eidos-plugin")
      for (const watcher of watchers.values()) void watcher.close()
      watchers.clear()
      for (const pending of pendingReloads.values()) clearTimeout(pending.timer)
      pendingReloads.clear()
      for (const owner of owners) service.closeOwner(owner)
    },
    async verifyPackagedSmoke() {
      // Exercise the same package decoder used by startup discovery from the
      // packaged main process, where native esbuild must live outside asar.
      const bytes = encodePackage(
        {
          apiVersion: 1,
          id: "example.smoke",
          requires: { pluginApi: "2.0.0" },
          name: "Packaged smoke",
          version: "1.0.0",
          views: [
            {
              id: "text",
              title: "Text",
              context: "document",
              entry: "./view.js",
            },
          ],
          placements: [
            {
              location: "file/open",
              view: "text",
              extensions: [".txt"],
            },
          ],
        },
        { "./view.js": "export default function mount() {}" }
      )
      await store.install(bytes)
      const listing = await new PluginStore(store.directory).list()
      if (listing.plugins[0]?.manifest.id !== "example.smoke")
        throw new Error("Packaged plugin discovery failed after restart")
    },
  }
}
