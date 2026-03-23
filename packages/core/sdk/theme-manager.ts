import type { DataSpace } from "../data-space"

const THEME_DIR = "~/.eidos/themes"
const THEME_CONFIG_KEY = "eidos:space:config:theme"

/**
 * Theme manager for space-based themes
 * Themes are stored in <space>/.eidos/themes/<theme-name>/theme.css
 */
export class ThemeManager {
  constructor(private dataSpace: DataSpace) {}

  private get fs() {
    if (!this.dataSpace.externalFS) {
      throw new Error("External file system not available")
    }
    return this.dataSpace.fs
  }

  /**
   * List all available theme names
   */
  async list(): Promise<string[]> {
    const themes: string[] = []

    try {
      const exists = await this.fs.exists(THEME_DIR)
      if (!exists) return themes

      const entries = await this.fs.readdir(THEME_DIR, { withFileTypes: true })

      for (const entry of entries) {
        if (entry.kind !== "directory") continue

        const cssPath = `${THEME_DIR}/${entry.name}/theme.css`
        const cssExists = await this.fs.exists(cssPath)
        if (cssExists) {
          themes.push(entry.name)
        }
      }
    } catch (error) {
      console.error("Failed to list themes:", error)
    }

    return themes
  }

  /**
   * Get theme CSS content
   */
  async get(name: string): Promise<string | null> {
    try {
      const cssPath = `${THEME_DIR}/${name}/theme.css`
      const exists = await this.fs.exists(cssPath)
      if (!exists) return null
      return await this.fs.readFile(cssPath, "utf8")
    } catch (error) {
      console.error(`Failed to get theme "${name}":`, error)
      return null
    }
  }

  /**
   * Install or update a theme
   */
  async install(name: string, css: string): Promise<void> {
    await this.fs.mkdir(THEME_DIR, { recursive: true })
    const themePath = `${THEME_DIR}/${name}`
    await this.fs.mkdir(themePath, { recursive: true })
    await this.fs.writeFile(`${themePath}/theme.css`, css, "utf8")
  }

  /**
   * Uninstall a theme
   */
  async uninstall(name: string): Promise<void> {
    const themePath = `${THEME_DIR}/${name}`
    await this.fs.rmdir(themePath)
  }

  /**
   * Get current theme name
   */
  async getCurrent(): Promise<string | null> {
    return await this.dataSpace.kv.get(THEME_CONFIG_KEY)
  }

  /**
   * Set current theme (null to reset to default)
   */
  async setCurrent(name: string | null): Promise<void> {
    if (name) {
      await this.dataSpace.kv.put(THEME_CONFIG_KEY, name)
    } else {
      await this.dataSpace.kv.delete(THEME_CONFIG_KEY)
    }
  }

  /**
   * Get theme directory path
   */
  getDirectory(): string {
    return THEME_DIR
  }
}
