import type { DataEditorProps } from "@glideapps/glide-data-grid"

import { defaultConfig } from "./grid-default-config"

export function baseGridScrollbarConfig(
  hasHorizontalScroll: boolean,
  scrollbarWidth: number
): Pick<DataEditorProps, "experimental"> {
  return {
    experimental: hasHorizontalScroll
      ? defaultConfig.experimental
      : {
          ...defaultConfig.experimental,
          scrollbarWidthOverride: scrollbarWidth,
          paddingBottom: scrollbarWidth || 0,
        },
  }
}
