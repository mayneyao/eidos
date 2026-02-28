/**
 * Extension Source Registry
 *
 * AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
 * Run 'npm run gen:registry' (or similar) to update
 */

import { registerExtensionSource } from "./eject-extension"
import journal_index_tsx from "./blocks/journal/index.tsx?raw"
import journal_use_journals_ts from "./blocks/journal/use-journals.ts?raw"
import journal_utils_ts from "./blocks/journal/utils.ts?raw"
import media_preview_index_tsx from "./blocks/media-preview/index.tsx?raw"
import graft_index_tsx from "./blocks/graft/index.tsx?raw"
import graft_use_graft_ts from "./blocks/graft/use-graft.ts?raw"
import monaco_editor_index_tsx from "./blocks/monaco-editor/index.tsx?raw"

/**
 * Register all built-in extension sources with their files
 */
export function initializeExtensionSources() {
  // journal
  registerExtensionSource("journal", {
    "index.tsx": journal_index_tsx,
    "use-journals.ts": journal_use_journals_ts,
    "utils.ts": journal_utils_ts,
  })

  // media-preview
  registerExtensionSource("media-preview", {
    "index.tsx": media_preview_index_tsx,
  })

  // graft
  registerExtensionSource("graft", {
    "index.tsx": graft_index_tsx,
    "use-graft.ts": graft_use_graft_ts,
  })

  // monaco-editor
  registerExtensionSource("monaco-editor", {
    "index.tsx": monaco_editor_index_tsx,
  })
}
