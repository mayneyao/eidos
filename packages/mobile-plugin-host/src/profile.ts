import { parseManifest } from "../../plugin-runtime/src/manifest"

/** Capabilities implemented by the mobile workbench. */
export function validateMobileManifest(input: unknown) {
  const manifest = parseManifest(input)
  if (manifest.kind === "theme") throw new Error("移动端不支持插件主题")
  if (
    manifest.requires?.pluginApi !== "3.0.0" ||
    manifest.formatters?.length ||
    manifest.storage ||
    manifest.workspace?.filemeta ||
    manifest.placements?.some(
      (p) =>
        ![
          "file/open",
          "table/view",
          "table/context",
          "command-palette",
          "navigation",
        ].includes(p.location)
    )
  ) {
    throw new Error("此插件需要移动端尚未支持的能力")
  }
  return manifest
}
