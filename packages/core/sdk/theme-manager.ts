import { MsgType } from "@/lib/const"
import type { DataSpace } from "../data-space"

export class ThemeManager {
  constructor(private dataSpace: DataSpace) {}

  async getTheme(name: string) {
    const theme = await this.dataSpace.callRenderer?.(MsgType.GetTheme, name)
    return theme
  }

  async setTheme(name: string, css: string) {
    await this.dataSpace.callRenderer?.(MsgType.SetTheme, { name, css })
  }

  async listThemes() {
    const themes = await this.dataSpace.callRenderer?.(MsgType.ListThemes, null)
    return themes
  }

  async applyTheme(name: string, css: string) {
    await this.dataSpace.callRenderer?.(MsgType.ApplyTheme, { name, css })
  }

  async setCurrentTheme(name: string) {
    await this.dataSpace.callRenderer?.(MsgType.SetCurrentTheme, name)
  }
}
