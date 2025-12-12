import { useEffect } from "react"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { useTabContext } from "@/apps/web-app/components/tab-manager/tab-context"

export function useTabTitle(title: string | undefined | null) {
    // Try to get tab context, but don't fail if not inside a tab (e.g. initial render or no-tab mode)
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
            updateTab(tabId, { title: title || "Untitled" })
        }
    }, [tabId, title, updateTab])
}
