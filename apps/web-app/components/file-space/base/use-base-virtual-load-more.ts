import { useEffect } from "react"

export function useBaseVirtualLoadMore({
  enabled,
  lastVirtualIndex,
  loadBoundary,
  onLoadMore,
}: {
  enabled: boolean
  lastVirtualIndex: number
  loadBoundary: number
  onLoadMore: () => void
}) {
  useEffect(() => {
    if (!enabled || lastVirtualIndex < loadBoundary) return
    onLoadMore()
  }, [enabled, lastVirtualIndex, loadBoundary, onLoadMore])
}
