// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest"

import { acquireGlideDataGridPortal } from "./use-glide-data-grid-portal"

afterEach(() => {
  document.body.replaceChildren()
})

describe("Glide Data Grid portal", () => {
  it("provides a document-level editor portal and removes it after release", () => {
    const release = acquireGlideDataGridPortal()
    const portal = document.getElementById("portal")

    expect(portal).not.toBeNull()
    expect(document.body.lastElementChild).toBe(portal)
    expect(portal?.dataset.eidosFileUiGlidePortal).toBe("true")
    expect(portal?.style.position).toBe("fixed")
    expect(portal?.style.left).toBe("0px")
    expect(portal?.style.top).toBe("0px")
    expect(portal?.style.zIndex).toBe("9999")

    release()
    release()
    expect(document.getElementById("portal")).toBeNull()
  })

  it("reuses and preserves a portal supplied by the host", () => {
    const hostPortal = document.createElement("div")
    hostPortal.id = "portal"
    hostPortal.style.zIndex = "17"
    document.body.append(hostPortal)

    const release = acquireGlideDataGridPortal()

    expect(document.getElementById("portal")).toBe(hostPortal)
    expect(hostPortal.dataset.eidosFileUiGlidePortal).toBeUndefined()
    expect(hostPortal.style.zIndex).toBe("17")

    release()
    expect(document.getElementById("portal")).toBe(hostPortal)
  })

  it("keeps its managed portal until the final grid releases it", () => {
    const releaseFirst = acquireGlideDataGridPortal()
    const portal = document.getElementById("portal")
    const releaseSecond = acquireGlideDataGridPortal()

    releaseFirst()
    expect(document.getElementById("portal")).toBe(portal)

    releaseSecond()
    expect(document.getElementById("portal")).toBeNull()
  })
})
