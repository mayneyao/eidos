import type { Theme } from "@glideapps/glide-data-grid"

import type { EidosFileUIThemeName } from "./context"
import { useEidosFileGridThemeForElement } from "./theme-internal"

export function useEidosFileGridTheme(themeName: EidosFileUIThemeName): Theme {
  return useEidosFileGridThemeForElement(themeName)
}
