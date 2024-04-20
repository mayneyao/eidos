import { useEffect, useState } from "react"

export const useWindowControlsOverlayVisible = () => {
  const [visible, setVisible] = useState(
    navigator.windowControlsOverlay.visible
  )

  useEffect(() => {
    if ("windowControlsOverlay" in navigator) {
      const handler = () => {
        setTimeout(() => {
          setVisible(navigator.windowControlsOverlay.visible)
        }, 200)
      }
      navigator.windowControlsOverlay.addEventListener(
        "geometrychange",
        handler
      )
      return () => {
        navigator.windowControlsOverlay.removeEventListener(
          "geometrychange",
          handler
        )
      }
    }
  }, [])

  return visible
}
