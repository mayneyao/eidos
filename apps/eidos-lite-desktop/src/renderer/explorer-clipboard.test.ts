// @vitest-environment jsdom
import type { SpaceTreeEntry } from "../shared/contracts"
import {
  explorerClipboardEntries,
  explorerClipboardSourceAvailable,
  explorerPasteTarget,
  canPasteExplorerClipboard,
  canCaptureExplorerEntries,
  explorerClipboardKeyboardCommand,
} from "./explorer-clipboard"
const entry = (
  path: string,
  kind: SpaceTreeEntry["kind"] = "file"
): SpaceTreeEntry => ({
  name: path.split("/").at(-1)!,
  relativePath: path,
  kind,
  size: 0,
  modifiedAtMs: 0,
})

it("deduplicates parent and child selections and resolves folder/file/blank targets", () => {
  const folder = entry("docs", "directory")
  const file = entry("docs/a.mp4")
  expect(explorerClipboardEntries([file, folder, file, entry("b.md")])).toEqual(
    [folder, entry("b.md")]
  )
  expect(explorerPasteTarget(folder, null)).toBe("docs")
  expect(explorerPasteTarget(file, null)).toBe("docs")
  expect(explorerPasteTarget(entry("a.md"), "docs")).toBeNull()
  expect(explorerPasteTarget(null, "docs")).toBe("docs")
  expect(explorerPasteTarget(null, null)).toBeNull()
})

it("disables sources removed from an authoritative tree while retaining unhydrated sources for host validation", () => {
  expect(explorerClipboardSourceAvailable([], "gone.md")).toBe(false)
  expect(
    explorerClipboardSourceAvailable([entry("docs", "directory")], "docs/a.md")
  ).toBe(true)
  expect(
    explorerClipboardSourceAvailable(
      [{ ...entry("docs", "directory"), childrenLoaded: true, children: [] }],
      "docs/a.md"
    )
  ).toBe(false)
  expect(
    explorerClipboardSourceAvailable([entry("a.md", "symlink")], "a.md")
  ).toBe(false)
})

it("disables invalid paths, self/descendant and same-directory targets and other Space clipboards", () => {
  const clipboard = {
    mode: "copy" as const,
    spaceId: "a",
    entries: [entry("docs", "directory")],
  }
  expect(canPasteExplorerClipboard(clipboard, "a", "docs/nested")).toBe(false)
  expect(canPasteExplorerClipboard(clipboard, "a", null)).toBe(false)
  expect(canPasteExplorerClipboard(clipboard, "a", "target")).toBe(true)
  expect(canPasteExplorerClipboard(clipboard, "b", "target")).toBe(false)
  for (const path of [
    "../a",
    ".graft",
    ".eidos/catalog.eidos",
    "records.eidos-wal",
  ])
    expect(canCaptureExplorerEntries([entry(path)])).toBe(false)
  expect(canCaptureExplorerEntries([entry("link", "symlink")])).toBe(false)
})

it("ignores composition, repeats and non-primary or extra modifiers", () => {
  for (const options of [
    { ctrlKey: true, shiftKey: true },
    { ctrlKey: true, altKey: true },
    { metaKey: true },
    { ctrlKey: true, repeat: true },
    { ctrlKey: true, isComposing: true },
  ]) {
    expect(
      explorerClipboardKeyboardCommand(
        new KeyboardEvent("keydown", { key: "v", ...options }),
        false
      )
    ).toBeNull()
  }
})
