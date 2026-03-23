/**
 * Theme market service for fetching themes from GitHub-based registry
 * Runs in desktop/main process
 */

export interface ThemeRegistryItem {
  name: string
  author: string
  repo: string
  screenshot: string
  modes: ("light" | "dark")[]
  legacy?: boolean
}

type ThemeRegistry = ThemeRegistryItem[]

export class ThemeMarket {
  private registryCache: ThemeRegistry | null = null
  private registryCacheTime = 0
  private readonly CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  constructor(
    private registryUrl = "https://raw.githubusercontent.com/eidos-space/registry/main/themes.registry.json"
  ) {}

  /**
   * Fetch registry from GitHub
   */
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
   */
  async list(): Promise<ThemeRegistryItem[]> {
    return await this.fetchRegistry()
  }

  /**
   * Get theme by repo name
   */
  async get(repo: string): Promise<ThemeRegistryItem | null> {
    const themes = await this.fetchRegistry()
    return themes.find((t) => t.repo === repo) || null
  }

  /**
   * Search themes by name or author
   */
  async search(query: string): Promise<ThemeRegistryItem[]> {
    const themes = await this.fetchRegistry()
    const q = query.toLowerCase()
    return themes.filter(
      (t) =>
        t.name.toLowerCase().includes(q) || t.author.toLowerCase().includes(q)
    )
  }

  /**
   * Get download URL for theme.css
   */
  getCssUrl(repo: string, branch = "main"): string {
    return `https://raw.githubusercontent.com/${repo}/${branch}/theme.css`
  }

  /**
   * Get screenshot URL
   */
  getScreenshotUrl(theme: ThemeRegistryItem, branch = "main"): string {
    return `https://raw.githubusercontent.com/${theme.repo}/${branch}/${theme.screenshot}`
  }

  /**
   * Download theme CSS
   */
  async download(repo: string, branch = "main"): Promise<string | null> {
    const url = this.getCssUrl(repo, branch)
    const response = await fetch(url)
    return response.ok ? await response.text() : null
  }
}

// Singleton instance
let defaultMarket: ThemeMarket | null = null

export function getThemeMarket(): ThemeMarket {
  if (!defaultMarket) {
    defaultMarket = new ThemeMarket()
  }
  return defaultMarket
}
