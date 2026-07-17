import type { DataEditorProps } from "@glideapps/glide-data-grid"

import { defaultConfig } from "./grid-default-config"

export function baseGridScrollbarConfig(
  hasHorizontalScroll: boolean
): Pick<DataEditorProps, "experimental"> {
  return {
    experimental: hasHorizontalScroll
      ? defaultConfig.experimental
      : {
          ...defaultConfig.experimental,
          // Glide includes the system scrollbar in its ideal height even when
          // no horizontal overflow exists, leaving a blank strip after New.
          scrollbarWidthOverride: 0,
        },
  }
}
