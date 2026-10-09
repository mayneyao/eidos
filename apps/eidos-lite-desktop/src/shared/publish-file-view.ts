import type { PluginManifest, ViewDeclaration } from "@eidos.space/plugin-sdk"

/** Published Views run without the desktop's local services. */
export function isPublishableFileView(
  manifest: PluginManifest,
  view: ViewDeclaration
): boolean {
  return (
    manifest.requires?.pluginApi === "3.0.0" &&
    !manifest.workspace &&
    !manifest.connections &&
    !manifest.settings &&
    !manifest.storage &&
    view.kind === "file" &&
    view.access === "read" &&
    !view.capabilities?.length
  )
}

export function publishableFileViews(
  manifest: PluginManifest,
  filename: string
): ViewDeclaration[] {
  const extension = filename.includes(".")
    ? "." + filename.split(".").at(-1)!.toLowerCase()
    : ""
  return (manifest.views ?? []).filter(
    (view) =>
      isPublishableFileView(manifest, view) &&
      manifest.placements?.some(
        (placement) =>
          placement.location === "file/open" &&
          placement.view === view.id &&
          placement.extensions.some(
            (value) => value.toLowerCase() === extension
          )
      )
  )
}
