import { memo } from "react"
import {
  EidosFileGrid as SharedEidosFileGrid,
  EidosFileUIProvider,
  type EidosFileGridProps,
  type EidosFileGridRowEdit,
} from "@eidos.space/eidos-file-ui"

import { useCurrentTheme } from "@/apps/web-app/hooks/use-current-theme"
import { useTheme } from "@/components/theme-provider"
import { useDynamicTheme } from "@/components/table/views/grid/theme"

export type { EidosFileGridProps, EidosFileGridRowEdit }

/**
 * Desktop host adapter. Product behavior lives in @eidos.space/eidos-file-ui; this
 * wrapper supplies the current Space theme and native asset URL resolution.
 */
export const EidosFileGrid = memo(function EidosFileGrid(
  props: EidosFileGridProps
) {
  const { resolvedTheme } = useTheme()
  const { css: spaceThemeCss } = useCurrentTheme()
  const gridTheme = useDynamicTheme(resolvedTheme, spaceThemeCss)
  return (
    <EidosFileUIProvider
      themeName={resolvedTheme === "dark" ? "dark" : "light"}
    >
      <SharedEidosFileGrid {...props} gridTheme={gridTheme} />
    </EidosFileUIProvider>
  )
})
