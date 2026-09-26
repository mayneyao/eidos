import fs from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { decodePackage } from "@eidos.space/plugin-runtime/package"
import type { MarketplacePlugin, PluginMarketplace } from "../../shared/plugins"

export const PLUGIN_REGISTRY_URL =
  "https://raw.githubusercontent.com/eidos-space/registry/main/plugins.registry.json"
const hosts = new Set([
  "raw.githubusercontent.com",
  "github.com",
  "release-assets.githubusercontent.com",
  "objects.githubusercontent.com",
])
const SCREENSHOT_PATH =
  /^(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9._/-]*\.(?:png|jpe?g|webp)$/u
type Fetcher = typeof fetch

export function parsePluginRegistry(value: unknown): MarketplacePlugin[] {
  if (!value || typeof value !== "object")
    throw new Error("Invalid plugin registry")
  const root = value as Record<string, unknown>
  if (
    root.schemaVersion !== 1 ||
    !Array.isArray(root.plugins) ||
    root.plugins.length > 1000
  )
    throw new Error("Unsupported plugin registry")
  const ids = new Set<string>()
  return root.plugins.map((raw) => {
    if (!raw || typeof raw !== "object")
      throw new Error("Invalid registry entry")
    const p = raw as Record<string, unknown>
    for (const key of [
      "id",
      "name",
      "description",
      "repo",
      "version",
      "tag",
      "asset",
      "sha256",
      "compatibility",
    ])
      if (
        typeof p[key] !== "string" ||
        !p[key] ||
        (p[key] as string).length > 1024 ||
        /[\u0000-\u001f]/.test(p[key] as string)
      )
        throw new Error("Invalid registry field")
    if (
      !/^[a-z][a-z0-9.-]{1,127}$/.test(String(p.id)) ||
      ids.has(String(p.id)) ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(
        String(p.repo)
      ) ||
      !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(String(p.version)) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(String(p.tag)) ||
      p.asset !== `${p.id}-${p.version}.eidos-plugin` ||
      !/^[a-f0-9]{64}$/.test(String(p.sha256)) ||
      (p.preview !== undefined && p.preview !== false) ||
      (p.kind !== undefined && p.kind !== "theme") ||
      (p.kind === "theme") !== (p.category === "themes")
    )
      throw new Error("Invalid registry identity")
    ids.add(String(p.id))
    if (p.icon !== undefined) {
      if (typeof p.icon === "string") {
        if (
          !/^data:image\/(svg\+xml|png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(
            p.icon
          ) ||
          p.icon.length > 512 * 1024
        )
          throw new Error("Invalid registry icon data")
      } else if (p.icon && typeof p.icon === "object") {
        const icon = p.icon as { paths?: unknown; src?: unknown }
        if (icon.paths !== undefined) {
          if (
            !Array.isArray(icon.paths) ||
            !icon.paths.length ||
            icon.paths.length > 16 ||
            icon.paths.some(
              (d) =>
                typeof d !== "string" ||
                d.length > 2048 ||
                !/^[Mm][\s\d.,+eE\-MmLlHhVvCcSsQqTtAaZz]+$/.test(d)
            )
          )
            throw new Error("Invalid registry icon paths")
        }
        if (icon.src !== undefined) {
          if (
            typeof icon.src !== "string" ||
            !/^data:image\/(svg\+xml|png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(
              icon.src
            ) ||
            icon.src.length > 512 * 1024
          )
            throw new Error("Invalid registry icon src")
        }
        if (icon.paths === undefined && icon.src === undefined) {
          throw new Error("Invalid registry icon")
        }
      } else {
        throw new Error("Invalid registry icon")
      }
    }
    const screenshots: { path: string; alt: string }[] = []
    if (p.screenshots !== undefined) {
      if (!Array.isArray(p.screenshots) || p.screenshots.length > 8) {
        throw new Error("Invalid registry screenshots")
      }
      for (const item of p.screenshots) {
        if (
          !item ||
          typeof item !== "object" ||
          typeof (item as { path?: unknown }).path !== "string" ||
          typeof (item as { alt?: unknown }).alt !== "string"
        ) {
          throw new Error("Invalid registry screenshot entry")
        }
        const s = item as { path: string; alt: string }
        if (
          s.path.length > 256 ||
          s.alt.length > 1024 ||
          s.alt.length < 1 ||
          /[\u0000-\u001f]/.test(s.alt) ||
          !SCREENSHOT_PATH.test(s.path)
        ) {
          throw new Error("Invalid registry screenshot entry")
        }
        screenshots.push({ path: s.path, alt: s.alt })
      }
    }
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      repo: p.repo,
      version: p.version,
      tag: p.tag,
      asset: p.asset,
      sha256: p.sha256,
      preview: false,
      compatibility: p.compatibility,
      ...(p.kind === "theme" ? { kind: "theme" } : {}),
      ...(p.icon ? { icon: p.icon } : {}),
      ...(screenshots.length ? { screenshots } : {}),
    } as MarketplacePlugin
  })
}

export async function registryDownload(
  url: string,
  limit: number,
  fetcher: Fetcher,
  onProgress?: (loaded: number, total: number) => void
): Promise<Uint8Array> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    for (let redirect = 0; redirect < 5; redirect++) {
      const target = new URL(url)
      if (
        target.protocol !== "https:" ||
        !hosts.has(target.hostname) ||
        target.port ||
        target.username ||
        target.password
      )
        throw new Error("Untrusted registry download URL")
      const response = await fetcher(url, {
        redirect: "manual",
        credentials: "omit",
        signal: controller.signal,
      })
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel()
        const location = response.headers.get("location")
        if (!location) throw new Error("Invalid download redirect")
        url = new URL(location, url).href
        continue
      }
      if (!response.ok || !response.body)
        throw new Error(`Download failed (${response.status})`)
      const contentLength = Number(response.headers.get("content-length")) || 0
      if (contentLength > limit) {
        await response.body.cancel()
        throw new Error("Download is too large")
      }
      const chunks: Uint8Array[] = []
      let size = 0
      const reader = response.body.getReader()
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.length
        if (size > limit) {
          await reader.cancel()
          throw new Error("Download is too large")
        }
        chunks.push(value)
        if (onProgress && contentLength > 0) {
          onProgress(size, contentLength)
        }
      }
      return Buffer.concat(chunks)
    }
    throw new Error("Too many download redirects")
  } finally {
    clearTimeout(timer)
  }
}

export class PluginRegistry {
  private cached?: PluginMarketplace
  private pending?: Promise<PluginMarketplace>
  constructor(
    private readonly directory: string,
    private readonly fetcher: Fetcher = fetch
  ) {}
  async list(refresh = false): Promise<PluginMarketplace> {
    if (
      !refresh &&
      this.cached &&
      !this.cached.cached &&
      Date.now() - Date.parse(this.cached.fetchedAt) < 300000
    )
      return this.cached
    if (this.pending) return this.pending
    this.pending = this.load().finally(() => {
      this.pending = undefined
    })
    return this.pending
  }
  private async load(): Promise<PluginMarketplace> {
    const file = path.join(this.directory, "marketplace-cache.json")
    try {
      const bytes = await registryDownload(
        PLUGIN_REGISTRY_URL,
        1024 * 1024,
        this.fetcher
      )
      const value = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes)
      )
      const result = {
        plugins: parsePluginRegistry(value),
        cached: false,
        fetchedAt: new Date().toISOString(),
      }
      this.cached = result
      await fs
        .mkdir(this.directory, { recursive: true, mode: 0o700 })
        .then(() => fs.writeFile(`${file}.tmp`, JSON.stringify(result)))
        .then(() => fs.rename(`${file}.tmp`, file))
        .catch(() => {})
      return result
    } catch (cause) {
      if (this.cached) return (this.cached = { ...this.cached, cached: true })
      try {
        if ((await fs.stat(file)).size > 1024 * 1024)
          throw new Error("Invalid cache size")
        const saved = JSON.parse(await fs.readFile(file, "utf8"))
        return {
          plugins: parsePluginRegistry({
            schemaVersion: 1,
            plugins: saved.plugins,
          }),
          cached: true,
          fetchedAt: String(saved.fetchedAt),
        }
      } catch {
        throw new Error(
          `Cannot load the plugin marketplace: ${cause instanceof Error ? cause.message : String(cause)}`
        )
      }
    }
  }
  async download(
    id: string,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<Uint8Array> {
    const catalog = await this.list(true)
    if (catalog.cached)
      throw new Error("Connect to the internet to install from Marketplace")
    const entry = catalog.plugins.find((plugin) => plugin.id === id)
    if (!entry) throw new Error("Plugin is no longer listed in the registry")
    const bytes = await registryDownload(
      `https://github.com/${entry.repo}/releases/download/${entry.tag}/${entry.asset}`,
      16 * 1024 * 1024,
      this.fetcher,
      onProgress
    )
    if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256)
      throw new Error("Plugin checksum does not match the registry")
    const pkg = decodePackage(bytes)
    if (pkg.manifest.id !== entry.id || pkg.manifest.version !== entry.version)
      throw new Error("Plugin identity does not match the registry")
    if ((pkg.manifest.kind === "theme") !== (entry.kind === "theme"))
      throw new Error("Plugin kind does not match the registry")
    return bytes
  }
  async readme(id: string): Promise<string | null> {
    const catalog = await this.list(false)
    const entry = catalog.plugins.find((plugin) => plugin.id === id)
    if (!entry || !entry.repo) return null
    const cacheDir = path.join(this.directory, "readme")
    const cacheFile = path.join(cacheDir, `${id}.md`)
    if (catalog.cached) {
      try {
        return await fs.readFile(cacheFile, "utf8")
      } catch {
        return null
      }
    }
    for (const branch of ["main", "master"]) {
      try {
        const url = `https://raw.githubusercontent.com/${entry.repo}/${branch}/README.md`
        const bytes = await registryDownload(url, 1024 * 1024, this.fetcher)
        const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
        await fs
          .mkdir(cacheDir, { recursive: true, mode: 0o700 })
          .then(() => fs.writeFile(`${cacheFile}.tmp`, content, "utf8"))
          .then(() => fs.rename(`${cacheFile}.tmp`, cacheFile))
          .catch(() => {})
        return content
      } catch {}
    }
    try {
      return await fs.readFile(cacheFile, "utf8")
    } catch {
      return null
    }
  }
}
