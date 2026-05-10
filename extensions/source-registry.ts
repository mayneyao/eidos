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
import folder_browser_index_tsx from "./blocks/folder-browser/index.tsx?raw"
import folder_browser_utils_ts from "./blocks/folder-browser/utils.ts?raw"
import folder_browser_types_ts from "./blocks/folder-browser/types.ts?raw"
import folder_browser_components_ErrorState_tsx from "./blocks/folder-browser/components/ErrorState.tsx?raw"
import folder_browser_components_Breadcrumb_tsx from "./blocks/folder-browser/components/Breadcrumb.tsx?raw"
import folder_browser_components_ContextMenu_tsx from "./blocks/folder-browser/components/ContextMenu.tsx?raw"
import folder_browser_components_FileList_tsx from "./blocks/folder-browser/components/FileList.tsx?raw"
import folder_browser_components_StatusBar_tsx from "./blocks/folder-browser/components/StatusBar.tsx?raw"
import folder_browser_components_SearchInput_tsx from "./blocks/folder-browser/components/SearchInput.tsx?raw"
import folder_browser_components_FileIcon_tsx from "./blocks/folder-browser/components/FileIcon.tsx?raw"
import folder_browser_components_LoadingState_tsx from "./blocks/folder-browser/components/LoadingState.tsx?raw"
import folder_browser_hooks_useKeyboardNavigation_ts from "./blocks/folder-browser/hooks/useKeyboardNavigation.ts?raw"
import folder_browser_hooks_useFolderEntries_ts from "./blocks/folder-browser/hooks/useFolderEntries.ts?raw"
import agent_history_index_tsx from "./blocks/agent/index.tsx?raw"
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

  // folder-browser
  registerExtensionSource("folder-browser", {
    "index.tsx": folder_browser_index_tsx,
    "utils.ts": folder_browser_utils_ts,
    "types.ts": folder_browser_types_ts,
    "components/ErrorState.tsx": folder_browser_components_ErrorState_tsx,
    "components/Breadcrumb.tsx": folder_browser_components_Breadcrumb_tsx,
    "components/ContextMenu.tsx": folder_browser_components_ContextMenu_tsx,
    "components/FileList.tsx": folder_browser_components_FileList_tsx,
    "components/StatusBar.tsx": folder_browser_components_StatusBar_tsx,
    "components/SearchInput.tsx": folder_browser_components_SearchInput_tsx,
    "components/FileIcon.tsx": folder_browser_components_FileIcon_tsx,
    "components/LoadingState.tsx": folder_browser_components_LoadingState_tsx,
    "hooks/useKeyboardNavigation.ts":
      folder_browser_hooks_useKeyboardNavigation_ts,
    "hooks/useFolderEntries.ts": folder_browser_hooks_useFolderEntries_ts,
  })

  // agent
  registerExtensionSource("agent", {
    "index.tsx": agent_history_index_tsx,
  })

  // browser-manager
  registerExtensionSource("browser-manager", {})

  // monaco-editor
  registerExtensionSource("monaco-editor", {
    "index.tsx": monaco_editor_index_tsx,
  })
}
