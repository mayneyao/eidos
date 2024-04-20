import { useEffect, useState } from "react"

export const useWindowControlsOverlayVisible = () => {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if ("windowControlsOverlay" in navigator) {
      const handler = () => {
        setVisible((navigator as any).windowControlsOverlay.visible)
      }
      ;(navigator.windowControlsOverlay as any).addEventListener(
        "geometrychange",
        handler
      )
      return () => {
        ;((navigator as any).windowControlsOverlay as any).removeEventListener(
          "geometrychange",
          handler
        )
      }
    }
  }, [])

  return visible
}
