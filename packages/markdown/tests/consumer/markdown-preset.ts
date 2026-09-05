import { createMarkdownPreset } from "@eidos.space/markdown"
import { commonmarkPreset } from "@eidos.space/markdown/presets"
import { tablePlugin, mathPlugin } from "@eidos.space/markdown/plugins"

export const preset = createMarkdownPreset({
  id: "custom.markdown",
  extends: commonmarkPreset,
  exclude: ["eidos.image", "eidos.raw-html"],
  plugins: [tablePlugin, mathPlugin],
})
