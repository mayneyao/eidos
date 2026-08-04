import { useLayoutEffect } from "react"

import type { EidosFileUIThemeName } from "./context"

const GLIDE_DATA_GRID_PORTAL_ID = "portal"

let managedPortal: HTMLDivElement | null = null
let portalConsumers = 0

/**
 * Glide renders its cell editor into a document-level element with the fixed
 * id `portal`. Keep that renderer detail inside eidos-file-ui while preserving
 * portals supplied by existing hosts.
 */
export function acquireGlideDataGridPortal(): () => void {
  if (typeof document === "undefined") return () => undefined

  if (!document.getElementById(GLIDE_DATA_GRID_PORTAL_ID)) {
    const nextPortal = document.createElement("div")
    nextPortal.id = GLIDE_DATA_GRID_PORTAL_ID
    nextPortal.dataset.eidosFileUiGlidePortal = "true"
    nextPortal.dataset.eidosFileRoot = ""
    nextPortal.dataset.theme = "light"
    nextPortal.classList.add("eidos-file-root")
    nextPortal.style.position = "fixed"
    nextPortal.style.left = "0"
    nextPortal.style.top = "0"
    nextPortal.style.zIndex = "9999"
    document.body.append(nextPortal)
    managedPortal = nextPortal
  }

  portalConsumers += 1
  let released = false

  return () => {
    if (released) return
    released = true
    portalConsumers = Math.max(0, portalConsumers - 1)
    if (portalConsumers > 0) return

    managedPortal?.remove()
    managedPortal = null
  }
}

function applyGlideDataGridPortalTheme(themeName: EidosFileUIThemeName): void {
  const portal = document.getElementById(GLIDE_DATA_GRID_PORTAL_ID)
  if (!portal) return
  portal.dataset.eidosFileRoot = ""
  portal.dataset.theme = themeName
  portal.classList.add("eidos-file-root")
}

export function useGlideDataGridPortal(themeName: EidosFileUIThemeName): void {
  useLayoutEffect(() => acquireGlideDataGridPortal(), [])
  useLayoutEffect(() => applyGlideDataGridPortalTheme(themeName), [themeName])
}
