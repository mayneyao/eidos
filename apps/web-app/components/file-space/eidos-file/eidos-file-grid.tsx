import { memo, useCallback } from "react"
import {
  EidosFileGrid as SharedEidosFileGrid,
  EidosFileUIProvider,
  type EidosFileGridProps,
  type EidosFileGridRowEdit,
} from "@eidos.space/eidos-file-ui"

import { toSpaceAssetUrl } from "@/apps/web-app/components/file-space/file-path"
import { useCurrentTheme } from "@/apps/web-app/hooks/use-current-theme"
import { useTheme } from "@/components/theme-provider"
import { getFilePreviewImage, getFileType } from "@/lib/mime/mime"
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
  const resolveFilePreview = useCallback((path: string) => {
    if (/^(?:https?:|data:|blob:)/i.test(path)) {
      return getFilePreviewImage(path)
    }
    return getFileType(path) === "image"
      ? toSpaceAssetUrl(path)
      : getFilePreviewImage(path)
  }, [])

  return (
    <EidosFileUIProvider
      themeName={resolvedTheme === "dark" ? "dark" : "light"}
      resolveAssetUrl={toSpaceAssetUrl}
      resolveFilePreview={resolveFilePreview}
    >
      <SharedEidosFileGrid {...props} gridTheme={gridTheme} />
    </EidosFileUIProvider>
  )
})
