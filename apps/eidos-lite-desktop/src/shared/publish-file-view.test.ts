import { describe, expect, it } from "vitest"
import type { PluginManifest, ViewDeclaration } from "@eidos.space/plugin-sdk"
import {
  isPublishableFileView,
  publishableFileViews,
} from "./publish-file-view"

const view: ViewDeclaration = {
  id: "map",
  title: "Map",
  entry: "map.js",
  kind: "file",
  access: "read",
}
const manifest: PluginManifest = {
  apiVersion: 1,
  id: "test.gpx",
  name: "GPX",
  version: "1.0.0",
  requires: { pluginApi: "3.0.0" },
  views: [view],
  placements: [{ location: "file/open", view: "map", extensions: [".gpx"] }],
  browser: { workers: true, networkOrigins: ["https://tiles.openfreemap.org"] },
}

describe("published file View eligibility", () => {
  it("offers a compatible GPX View with declared browser network and workers", () => {
    expect(publishableFileViews(manifest, "ride.GPX")).toEqual([view])
    expect(publishableFileViews(manifest, "notes.txt")).toEqual([])
    expect(publishableFileViews(manifest, "gpx")).toEqual([])
  })
  it("rejects Views requiring write access, data capabilities, or a different API", () => {
    expect(isPublishableFileView(manifest, { ...view, access: "write" })).toBe(
      false
    )
    expect(isPublishableFileView(manifest, { ...view, kind: "page" })).toBe(
      false
    )
    expect(
      isPublishableFileView(manifest, { ...view, capabilities: ["document"] })
    ).toBe(false)
    expect(
      publishableFileViews(
        { ...manifest, requires: { pluginApi: "3.2.0" } },
        "ride.gpx"
      )
    ).toEqual([])
  })
  it("rejects dependencies on local host services in both selector and package boundary", () => {
    for (const local of [
      { workspace: { files: true } },
      { settings: {} },
      { storage: { maxBytes: 1024 } },
      { connections: {} },
    ]) {
      const dependent = { ...manifest, ...local }
      expect(isPublishableFileView(dependent, view)).toBe(false)
      expect(publishableFileViews(dependent, "ride.gpx")).toEqual([])
    }
  })
})
