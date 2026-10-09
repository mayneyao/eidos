import { parseManifest } from "../../plugin-runtime/src/manifest"

/** Capabilities implemented by the mobile workbench. */
export function validateMobileManifest(input: unknown) {
  const manifest = parseManifest(input)
  if (manifest.kind === "theme") throw new Error("移动端不支持插件主题")
  if (
    !["3.0.0", "3.3.0"].includes(manifest.requires?.pluginApi ?? "") ||
    manifest.formatters?.length ||
    manifest.fileTemplates?.length ||
    manifest.storage ||
    manifest.workspace?.filemeta ||
    manifest.hooks?.some((hook) =>
      hook.extensions.some(
        (extension) => ![".md", ".markdown"].includes(extension)
      )
    ) ||
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
