import fs from "node:fs/promises"
import {
  assertPluginCompatibility,
  checkPluginCompatibility,
} from "@eidos.space/plugin-runtime/compatibility"
import path from "node:path"
import { randomUUID } from "node:crypto"
import {
  decodePackage,
  packageHash,
  type PluginPackage,
} from "@eidos.space/plugin-runtime/package"
import {
  object,
  PluginError,
  PLUGIN_PACKAGE_LIMIT,
} from "@eidos.space/plugin-runtime/rpc"
import type {
  PluginEditorChoice,
  PluginListing,
  PluginSpaceConfig,
} from "../../shared/plugins"
import { PluginGrantStore } from "./plugin-grants"

interface Configuration {
  routes?: Record<string, Record<string, string>>
  version: 1
  installed: Record<string, { hash: string }>
  spaces: Record<string, PluginSpaceConfig>
  associations?: Record<string, string>
}
export const emptyScope = (): PluginSpaceConfig => ({
  plugins: {},
  associations: {},
})
const validHash = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
function parseScope(value: unknown): PluginSpaceConfig {
  const scope = object(value)
  const plugins: PluginSpaceConfig["plugins"] = {}
  for (const [id, raw] of Object.entries(object(scope.plugins))) {
    const binding = object(raw)
    if (
      typeof binding.enabled !== "boolean" ||
      !/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(id)
    )
      throw new Error("Invalid plugin configuration")
    plugins[id] = { enabled: binding.enabled }
  }
  const associations: Record<string, string> = {}
  for (const [ext, editor] of Object.entries(object(scope.associations))) {
    if (
      !/^\.[a-z0-9]{1,16}$/.test(ext) ||
      typeof editor !== "string" ||
      editor.length > 256
    )
      throw new Error("Invalid plugin association")
    associations[ext] = editor
  }
  const formatters: Record<string, string> = {}
  for (const [ext, key] of Object.entries(object(scope.formatters ?? {}))) {
    if (
      !/^\.[a-z0-9]{1,16}$/.test(ext) ||
      typeof key !== "string" ||
      !/^[a-z][a-z0-9.-]*\/[a-z][a-z0-9-]*$/.test(key)
    )
      throw new Error("Invalid default formatter")
    formatters[ext] = key
  }
  return {
    plugins,
    associations,
    ...(Object.keys(formatters).length ? { formatters } : {}),
  }
}
export class PluginStore {
  private readonly packages = new Map<
    string,
    { value: PluginPackage; size: number }
  >()
  private packageBytes = 0
  private remember(hash: string, value: PluginPackage): PluginPackage {
    if (this.packages.has(hash)) return value
    const size = Object.values(value.modules).reduce(
      (total, code) => total + Buffer.byteLength(code),
      0
    )
    // Keep the cache bounded when switching among large plugins/dev versions.
    while (this.packageBytes + size > 32 * 1024 * 1024 && this.packages.size) {
      const oldest = this.packages.keys().next().value!
      this.packageBytes -= this.packages.get(oldest)!.size
      this.packages.delete(oldest)
    }
    this.packages.set(hash, { value, size })
    this.packageBytes += size
    return value
  }
  // UI discovery needs declarations, not a fresh parse of every bundled module.
  // Hashes identify immutable versions. Execution still uses read(), which
  // checks the actual bytes every time it grants a new instance.
  private readonly manifests = new Map<
    string,
    Promise<PluginPackage["manifest"]>
  >()
  private manifest(hash: string): Promise<PluginPackage["manifest"]> {
    const cached = this.manifests.get(hash)
    if (cached) return cached
    const pending = this.read(hash)
      .then((pkg) => pkg.manifest)
      .catch((error) => {
        // Keep incompatible installations manageable after a host downgrade.
        // read() has verified the bytes and cached metadata before rejecting execution.
        const metadata = this.packages.get(hash)?.value.manifest
        if (
          error instanceof PluginError &&
          error.code === "UNSUPPORTED_API" &&
          metadata
        )
          return metadata
        this.manifests.delete(hash)
        throw error
      })
    this.manifests.set(hash, pending)
    return pending
  }
  private readonly trials = new Map<string, string>()
  private writes: Promise<unknown> = Promise.resolve()
  // Development paths are local process state and never persisted as authority.
  readonly development = new Map<string, string>()
  readonly resources: PluginGrantStore
  constructor(readonly directory: string) {
    this.resources = new PluginGrantStore(
      path.join(directory, "resource-grants.json")
    )
  }
  async config(): Promise<Configuration> {
    try {
      const value = object(
        JSON.parse(
          await fs.readFile(path.join(this.directory, "config.json"), "utf8")
        )
      )
      if (value.version !== 1)
        throw new Error(
          "Unsupported plugin configuration; this unpublished prototype requires a fresh plugin configuration"
        )
      const installed: Configuration["installed"] = {}
      for (const [id, raw] of Object.entries(object(value.installed))) {
        const binding = object(raw)
        if (
          !/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(id) ||
          !validHash(binding.hash)
        )
          throw new Error("Invalid installed plugin")
        installed[id] = { hash: binding.hash }
      }
      const spaces: Record<string, PluginSpaceConfig> = {}
      for (const [id, scope] of Object.entries(object(value.spaces)))
        spaces[id] = parseScope(scope)
      const routes: Record<string, Record<string, string>> = {}
      for (const [id, raw] of Object.entries(object(value.routes ?? {}))) {
        const entries = object(raw)
        if (
          Object.values(entries).some(
            (route) =>
              typeof route !== "string" || Buffer.byteLength(route) > 2048
          )
        )
          throw new Error("Invalid plugin route")
        routes[id] = entries as Record<string, string>
      }
      const associations: Record<string, string> = {}
      for (const [ext, editor] of Object.entries(
        object(value.associations ?? {})
      )) {
        if (
          !/^\.[a-z0-9]{1,16}$/.test(ext) ||
          typeof editor !== "string" ||
          editor.length > 256
        )
          throw new Error("Invalid plugin association")
        associations[ext] = editor
      }
      return { version: 1, installed, spaces, routes, associations }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { version: 1, installed: {}, spaces: {}, associations: {} }
      throw error
    }
  }
  private update(change: (config: Configuration) => void): Promise<void> {
    const next = this.writes.then(async () => {
      const config = await this.config()
      change(config)
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 })
      const temporary = path.join(this.directory, `config-${randomUUID()}.tmp`)
      try {
        await fs.writeFile(temporary, JSON.stringify(config, null, 2), {
          mode: 0o600,
        })
        await fs.rename(temporary, path.join(this.directory, "config.json"))
      } finally {
        await fs.rm(temporary, { force: true })
      }
    })
    this.writes = next.catch(() => {})
    return next
  }
  async read(hash: string): Promise<PluginPackage> {
    if (!validHash(hash))
      throw new PluginError("INVALID_REQUEST", "Invalid package hash")
    const bytes = await this.readBytes(
      path.join(this.directory, "packages", `${hash}.eidos-plugin`)
    )
    if (packageHash(bytes) !== hash)
      throw new PluginError(
        "INVALID_REQUEST",
        "Plugin package integrity check failed"
      )
    const cached = this.packages.get(hash)
    if (cached) {
      assertPluginCompatibility(cached.value.manifest, "eidos-lite")
      this.packages.delete(hash)
      this.packages.set(hash, cached)
      return cached.value
    }
    const pkg = this.remember(hash, decodePackage(bytes))
    assertPluginCompatibility(pkg.manifest, "eidos-lite")
    this.manifests.set(hash, Promise.resolve(pkg.manifest))
    return pkg
  }
  async pageRoute(spaceId: string, key: string): Promise<string> {
    return (await this.config()).routes?.[spaceId]?.[key] ?? ""
  }
  async setPageRoute(
    spaceId: string,
    key: string,
    route: string
  ): Promise<void> {
    if (Buffer.byteLength(route) > 2048)
      throw new PluginError("INVALID_REQUEST", "Route exceeds 2 KiB")
    await this.update((config) => {
      ;((config.routes ??= {})[spaceId] ??= {})[key] = route
    })
  }
  async readBytes(file: string): Promise<Buffer> {
    const handle = await fs.open(file, "r")
    try {
      const stats = await handle.stat()
      if (!stats.isFile() || stats.size > PLUGIN_PACKAGE_LIMIT)
        throw new PluginError("TOO_LARGE", "Plugin package exceeds 16 MiB")
      const bytes = Buffer.alloc(stats.size + 1)
      let count = 0
      while (count < bytes.length) {
        const read = await handle.read(bytes, count, bytes.length - count, null)
        if (!read.bytesRead) break
        count += read.bytesRead
      }
      if (count > stats.size)
        throw new PluginError(
          "INVALID_REQUEST",
          "Package changed while reading; retry after the build completes"
        )
      return bytes.subarray(0, count)
    } finally {
      await handle.close()
    }
  }
  async install(
    bytes: Uint8Array,
    spaceId?: string,
    persist = true
  ): Promise<string> {
    const pkg = decodePackage(bytes)
    assertPluginCompatibility(pkg.manifest, "eidos-lite")
    const hash = packageHash(bytes)
    const directory = path.join(this.directory, "packages")
    await fs.mkdir(directory, { recursive: true, mode: 0o700 })
    const target = path.join(directory, `${hash}.eidos-plugin`)
    const temporary = path.join(directory, `${hash}-${randomUUID()}.tmp`)
    try {
      const handle = await fs.open(temporary, "wx", 0o600)
      try {
        await handle.writeFile(bytes)
        await handle.sync()
      } finally {
        await handle.close()
      }
      try {
        await fs.link(temporary, target)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
        await this.read(hash)
      }
    } finally {
      await fs.rm(temporary, { force: true })
    }
    this.manifests.set(hash, Promise.resolve(pkg.manifest))
    if (!persist) {
      this.remember(hash, pkg)
      if (!(await this.config()).installed[pkg.manifest.id])
        throw new PluginError(
          "INVALID_REQUEST",
          "Trial requires an installed plugin"
        )
      this.trials.set(pkg.manifest.id, hash)
      return hash
    }
    await this.update((config) => {
      const installed = !!config.installed[pkg.manifest.id]
      config.installed[pkg.manifest.id] = { hash }
      if (spaceId && !installed)
        (config.spaces[spaceId] ??= emptyScope()).plugins[pkg.manifest.id] = {
          enabled: true,
        }
    })
    this.trials.delete(pkg.manifest.id)
    this.remember(hash, pkg)
    return hash
  }
  async enable(id: string, enabled: boolean, spaceId: string) {
    if (!spaceId || typeof enabled !== "boolean")
      throw new PluginError(
        "INVALID_REQUEST",
        "Enabling a plugin requires a Space"
      )
    if (enabled) {
      const binding = await this.installed(id)
      if (binding) await this.read(binding.hash)
    }
    await this.update((config) => {
      if (!config.installed[id])
        throw new PluginError("INVALID_REQUEST", "Plugin is not installed")
      const space = (config.spaces[spaceId] ??= emptyScope())
      space.plugins[id] = { enabled }
    })
  }
  async uninstall(id: string) {
    await this.resources.revokePlugin(id)
    await this.update((config) => {
      delete config.installed[id]
      for (const space of Object.values(config.spaces)) {
        delete space.plugins[id]
        for (const [ext, key] of Object.entries(space.formatters ?? {}))
          if (key.startsWith(`${id}/`)) delete space.formatters![ext]
        for (const [extension, editor] of Object.entries(space.associations))
          if (editor.startsWith(`${id}/`)) delete space.associations[extension]
      }
      if (config.associations) {
        for (const [extension, editor] of Object.entries(config.associations))
          if (editor.startsWith(`${id}/`)) delete config.associations[extension]
      }
    })
    this.trials.delete(id)
  }
  async setDefaultFormatter(
    extension: string,
    key: string | null,
    spaceId: string
  ) {
    if (!/^\.[a-z0-9]{1,16}$/.test(extension) || extension === ".eidos")
      throw new PluginError("INVALID_REQUEST", "Invalid file extension")
    if (key !== null) {
      const listing = await this.list(spaceId)
      if (
        !listing.plugins.some(
          (p) =>
            p.enabled &&
            p.manifest.formatters?.some(
              (f) =>
                `${p.manifest.id}/${f.id}` === key &&
                f.extensions.includes(extension)
            )
        )
      )
        throw new PluginError("INVALID_REQUEST", "Formatter unavailable")
    }
    await this.update((config) => {
      const scope = (config.spaces[spaceId] ??= emptyScope())
      const defaults = (scope.formatters ??= {})
      if (key === null) delete defaults[extension]
      else defaults[extension] = key
    })
  }
  async associate(extension: string, editor: string | null, spaceId?: string) {
    if (!/^\.[a-z0-9]{1,16}$/.test(extension) || extension === ".eidos")
      throw new PluginError("INVALID_REQUEST", "Invalid file extension")
    if (spaceId === "")
      throw new PluginError(
        "INVALID_REQUEST",
        "Default editor requires a Space"
      )
    if (
      editor !== null &&
      editor !== "builtin" &&
      !(await this.editors(`file${extension}`, spaceId)).some(
        (choice) => choice.key === editor
      )
    )
      throw new PluginError(
        "INVALID_REQUEST",
        "Editor is unavailable for this extension"
      )
    await this.update((config) => {
      if (spaceId) {
        const scope = (config.spaces[spaceId] ??= emptyScope())
        if (editor === null) delete scope.associations[extension]
        else scope.associations[extension] = editor
      } else {
        const defaults = (config.associations ??= {})
        if (editor === null) delete defaults[extension]
        else defaults[extension] = editor
      }
    })
  }
  async list(spaceId?: string): Promise<PluginListing> {
    const config = await this.config()
    const space = spaceId ? (config.spaces[spaceId] ?? emptyScope()) : null
    const plugins: PluginListing["plugins"] = []
    for (const [id, binding] of Object.entries(config.installed)) {
      const hash = this.trials.get(id) ?? binding.hash
      const manifest = await this.manifest(hash)
      if (manifest.id !== id)
        throw new PluginError(
          "INVALID_REQUEST",
          "Plugin binding identity mismatch"
        )
      plugins.push({
        manifest,
        hash,
        enabled:
          (space?.plugins[id]?.enabled ?? false) &&
          checkPluginCompatibility(manifest, "eidos-lite").compatible,
        developmentPath: this.development.get(hash),
      })
    }
    return {
      plugins,
      space,
      associations: config.associations ?? {},
    }
  }
  async installed(id: string) {
    const binding = (await this.config()).installed[id]
    return binding ? { hash: this.trials.get(id) ?? binding.hash } : undefined
  }
  discardTrial(id: string, expectedHash: string): void {
    if (this.trials.get(id) === expectedHash) this.trials.delete(id)
  }
  async binding(id: string, spaceId: string) {
    const config = await this.config()
    const installed = config.installed[id]
    return installed
      ? {
          hash: this.trials.get(id) ?? installed.hash,
          enabled: config.spaces[spaceId]?.plugins[id]?.enabled ?? false,
        }
      : undefined
  }
  async editors(
    relativePath: string,
    spaceId?: string
  ): Promise<PluginEditorChoice[]> {
    const extension = path.extname(relativePath).toLowerCase()
    const config = await this.config()
    const bindings = config.installed
    const choices: PluginEditorChoice[] = []
    for (const [id, binding] of Object.entries(bindings)) {
      if (spaceId && !config.spaces[spaceId]?.plugins[id]?.enabled) continue
      try {
        const manifest = await this.manifest(
          this.trials.get(id) ?? binding.hash
        )
        if (manifest.id !== id) continue
        if (!checkPluginCompatibility(manifest, "eidos-lite").compatible)
          continue
        for (const placement of manifest.placements ?? []) {
          if (
            placement.location !== "file/open" ||
            !placement.extensions.includes(extension)
          )
            continue
          const editor = manifest.views?.find(
            (view) =>
              view.id === placement.view &&
              view.context === (extension === ".eidos" ? "eidos" : "document")
          )
          if (editor)
            choices.push({
              key: `${id}/${editor.id}`,
              label: editor.title,
              pluginName: manifest.name,
              icon: editor.icon ?? manifest.icon ?? null,
            })
        }
      } catch {
        /* Unavailable packages do not change Space enablement or defaults. */
      }
    }
    return choices
  }
  async resolve(relativePath: string, spaceId: string, explicit?: string) {
    if (explicit === "builtin") return { editor: null }
    let config: Configuration
    try {
      config = await this.config()
    } catch (error) {
      if (explicit) throw error
      return {
        editor: null,
        warning:
          "Plugin configuration could not be read. Opened with the built-in editor.",
      }
    }
    const extension = path.extname(relativePath).toLowerCase()
    const key =
      explicit ??
      config.spaces[spaceId]?.associations?.[extension] ??
      config.associations?.[extension] ??
      "builtin"
    if (key === "builtin") return { editor: null }
    const editor = (await this.editors(relativePath, spaceId)).find(
      (choice) => choice.key === key
    )
    if (!editor) {
      if (explicit)
        throw new PluginError(
          "DOCUMENT_UNAVAILABLE",
          "Selected plugin editor is unavailable"
        )
      return {
        editor: null,
        warning:
          "Default plugin editor is unavailable. Opened with the built-in editor.",
      }
    }
    return { editor }
  }
}
