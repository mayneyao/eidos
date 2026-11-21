import { expect, it } from "vitest"
import { supportsMobileFileOpen, validateMobileManifest } from "./profile"

const manifest = {
  apiVersion: 1,
  id: "test.mobile-hooks",
  name: "Hooks",
  version: "1.0.0",
  requires: { pluginApi: "3.3.0" },
  extension: "./main.js",
  hooks: [
    {
      id: "save",
      title: "Save",
      event: "document.saved",
      extensions: [".md", ".markdown"],
      access: "write",
    },
  ],
}
it("admits Markdown hooks on both native hosts and rejects unsupported profiles", () => {
  expect(validateMobileManifest(manifest).hooks?.length).toBe(1)
  expect(() =>
    validateMobileManifest({
      ...manifest,
      hooks: [{ ...manifest.hooks[0], extensions: [".txt"] }],
    })
  ).toThrow()
  expect(() =>
    validateMobileManifest({ ...manifest, storage: { maxBytes: 1024 } })
  ).toThrow()
  expect(() =>
    validateMobileManifest({
      ...manifest,
      fileTemplates: [
        {
          id: "new",
          title: "New",
          extension: ".md",
          view: "missing",
          content: "",
        },
      ],
    })
  ).toThrow()
})

it("rejects native sidecars on both shared mobile hosts", () => {
  expect(() =>
    validateMobileManifest({
      ...manifest,
      requires: { pluginApi: "3.8.0" },
      sidecar: { command: "pi", args: ["--mode", "rpc"] },
    })
  ).toThrow("移动端尚未支持")
})

it("rejects atomic storage and bounded native output on mobile", () => {
  expect(() =>
    validateMobileManifest({
      ...manifest,
      requires: { pluginApi: "3.11.0" },
      storage: { maxBytes: 1024, atomic: true },
    })
  ).toThrow("移动端尚未支持")
  expect(() =>
    validateMobileManifest({
      ...manifest,
      requires: { pluginApi: "3.12.0" },
      sidecar: { command: "pi", maxOutputFrameBytes: 1024 },
    })
  ).toThrow("移动端尚未支持")
})

it("matches a file against every file/open placement for its View", () => {
  const plugin = validateMobileManifest({
    apiVersion: 1,
    id: "test.file-open",
    name: "File Open",
    version: "1.0.0",
    requires: { pluginApi: "3.7.0" },
    views: [
      { id: "editor", title: "Editor", kind: "file", entry: "./main.js" },
      { id: "other", title: "Other", kind: "file", entry: "./other.js" },
    ],
    placements: [
      { location: "file/open", view: "editor", extensions: [".txt"] },
      { location: "file/open", view: "editor", extensions: [".canvas"] },
      { location: "file/open", view: "other", extensions: [".json"] },
    ],
  })
  expect(supportsMobileFileOpen(plugin, "editor", "notes/Board.CANVAS")).toBe(
    true
  )
  expect(supportsMobileFileOpen(plugin, "editor", "notes/Readme.txt")).toBe(
    true
  )
  expect(supportsMobileFileOpen(plugin, "editor", "notes/Board.json")).toBe(
    false
  )
})
