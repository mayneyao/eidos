import { fileMetadataConfigPaths } from "./file-metadata-config"
import type { SpaceTreeEntry } from "./contracts"

it("finds nearest configurations before ancestors without including siblings or the target", () => {
  const entry = (
    relativePath: string,
    children?: SpaceTreeEntry[]
  ): SpaceTreeEntry => ({
    name: relativePath.split("/").at(-1)!,
    relativePath,
    kind: children ? "directory" : "eidos",
    size: 0,
    modifiedAtMs: 0,
    children,
  })
  const entries = [
    entry("files.eidos"),
    entry("project", [
      entry("project/files.eidos"),
      entry("project/assets", [entry("project/assets/photo.eidos")]),
    ]),
    entry("other", [entry("other/files.eidos")]),
  ]
  expect(
    fileMetadataConfigPaths(entries, "project/assets/photo.eidos")
  ).toEqual(["project/files.eidos", "files.eidos"])
})
