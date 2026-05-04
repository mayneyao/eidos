import { useTabContext } from "@/apps/web-app/components/tab-manager/tab-context"

/**
 * Hook to check if the current tab is the active tab in Eidos.
 * Uses the TabContext from the Eidos tab manager for perfect multi-tab awareness.
 */
export function useIsActiveTab(): boolean {
  try {
    const context = useTabContext()
    return context.isActive
  } catch (e) {
    // Fallback if not within a TabProvider
    return true
  }
}
