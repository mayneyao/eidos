import { IpcServiceBase, IpcMethod } from "@eidos.space/electron-ipc"
import { IpcInjectable } from "../../common/di"

export interface ThemeRegistryItem {
  name: string
  author: string
  repo: string
  screenshot: string
  modes: ("light" | "dark")[]
  legacy?: boolean
}

type ThemeRegistry = ThemeRegistryItem[]

@IpcInjectable("market", { exposeMode: "decorated" })
export class MarketService extends IpcServiceBase {
  private registryCache: ThemeRegistry | null = null
  private registryCacheTime = 0
  private readonly CACHE_TTL = 5 * 60 * 1000 // 5 minutes
  private readonly registryUrl =
    "https://raw.githubusercontent.com/eidos-space/registry/main/themes.registry.json"

  constructor() {
    super()
  }

  /**
   * Fetch registry from GitHub
   * IPC: market:fetchRegistry
   */
  @IpcMethod()
  async fetchRegistry(): Promise<ThemeRegistry> {
    const now = Date.now()
    if (this.registryCache && now - this.registryCacheTime < this.CACHE_TTL) {
      return this.registryCache
    }

    const response = await fetch(this.registryUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch registry: ${response.status}`)
    }

    const themes = (await response.json()) as ThemeRegistry
    this.registryCache = themes
    this.registryCacheTime = now
    return themes
  }

  /**
   * List all available themes
   * IPC: market:list
   */
  @IpcMethod()
  async list(): Promise<ThemeRegistryItem[]> {
    return await this.fetchRegistry()
  }

  /**
   * Get theme by repo name
   * IPC: market:get
   */
  @IpcMethod()
  async get(repo: string): Promise<ThemeRegistryItem | null> {
    const themes = await this.fetchRegistry()
    return themes.find((t) => t.repo === repo) || null
  }

  /**
   * Search themes by name or author
   * IPC: market:search
   */
  @IpcMethod()
  async search(query: string): Promise<ThemeRegistryItem[]> {
    const themes = await this.fetchRegistry()
    const q = query.toLowerCase()
    return themes.filter(
      (t) =>
        t.name.toLowerCase().includes(q) || t.author.toLowerCase().includes(q)
    )
  }

  /**
   * Download theme CSS
   * IPC: market:download
   */
  @IpcMethod()
  async download(repo: string, branch = "main"): Promise<string | null> {
    const url = `https://raw.githubusercontent.com/${repo}/${branch}/theme.css`
    const response = await fetch(url)
    return response.ok ? await response.text() : null
  }
}
