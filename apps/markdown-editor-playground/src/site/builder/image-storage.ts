import { useEffect, useMemo } from "react"
import { PlaygroundOpfsImageStore } from "./opfs-image-store.js"

/** Host example: stable OPFS addresses in Markdown, blob URLs only for display. */
export function useOpfsImageStorage() {
  const store = useMemo(() => new PlaygroundOpfsImageStore(), [])
  useEffect(() => () => store.dispose(), [store])
  return useMemo(
    () => ({
      onPasteImage: store.persistImage.bind(store),
      resolveImageUrl: store.resolveImageUrl.bind(store),
    }),
    [store]
  )
}
