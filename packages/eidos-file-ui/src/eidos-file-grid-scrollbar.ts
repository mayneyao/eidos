import type { DataEditorProps } from "@glideapps/glide-data-grid"

import { defaultConfig } from "./grid-default-config"

export function eidosFileGridScrollbarConfig(
  hasHorizontalScroll: boolean,
  measuredHeight?: number
): Pick<DataEditorProps, "experimental"> {
  return {
    experimental:
      hasHorizontalScroll && measuredHeight === undefined
        ? defaultConfig.experimental
        : {
            ...defaultConfig.experimental,
            // Match the actual styled gutter instead of Glide's system probe;
            // reserve nothing when columns fit or scrollbars overlay the canvas.
            scrollbarWidthOverride: hasHorizontalScroll ? measuredHeight : 0,
          },
  }
}
