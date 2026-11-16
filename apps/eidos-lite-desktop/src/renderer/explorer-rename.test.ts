import { explorerRenameSelectionEnd } from "./explorer-rename"

it.each([
  ["a.mp4", "file", "a"],
  ["report.final.MP4", "file", "report.final"],
  ["README", "file", "README"],
  [".gitignore", "file", ".gitignore"],
  [".config.json", "file", ".config.json"],
  ["trailing.", "file", "trailing."],
  ["folder.mp4", "directory", "folder.mp4"],
  ["中文 😀 片段.mp4", "file", "中文 😀 片段"],
] as const)("selects the rename stem for %s", (name, kind, selected) => {
  expect(name.slice(0, explorerRenameSelectionEnd(name, kind))).toBe(selected)
})
