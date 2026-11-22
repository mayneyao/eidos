import { parseManifest } from "../../plugin-runtime/src/manifest"
import type { PluginManifest } from "../../plugin-runtime/src/contracts"

export function supportsMobileFileOpen(
  manifest: Pick<PluginManifest, "placements">,
  view: string,
  path: string
): boolean {
  const lowerPath = path.toLowerCase()
  return (
    manifest.placements?.some(
      (placement) =>
        placement.location === "file/open" &&
        placement.view === view &&
        placement.extensions.some((extension) => lowerPath.endsWith(extension))
    ) ?? false
  )
}

/** Capabilities implemented by the mobile workbench. */
export function validateMobileManifest(input: unknown) {
  const manifest = parseManifest(input)
  // Static file templates remain valid package metadata even when only Lite offers creation.
  if (manifest.kind === "theme") throw new Error("移动端不支持插件主题")
  if (
    !/^3\.[0-7]\.0$/.test(manifest.requires?.pluginApi ?? "") ||
    manifest.background ||
    manifest.browser?.network ||
    manifest.formatters?.length ||
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
