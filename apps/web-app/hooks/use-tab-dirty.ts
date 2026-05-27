import { useEffect } from "react"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { useTabContext } from "@/apps/web-app/components/tab-manager/tab-context"

/**
 * Hook to mark the current tab as having unsaved changes.
 * Shows a dirty indicator on the tab and prompts before closing.
 *
 * @param isDirty - Whether the tab has unsaved changes
 *
 * @example
 * ```tsx
 * const [isDirty, setIsDirty] = useState(false)
 * useTabDirty(isDirty)
 *
 * // After save
 * setIsDirty(false)
 * ```
 */
export function useTabDirty(isDirty: boolean) {
  let tabId: string | null = null
  try {
    const context = useTabContext()
    tabId = context.tabId
  } catch (e) {
    // Ignore error if not in tab context
  }

  const updateTab = useTabStore((state) => state.updateTab)

  useEffect(() => {
    if (tabId) {
      updateTab(tabId, { isDirty })
    }
  }, [tabId, isDirty, updateTab])
}
