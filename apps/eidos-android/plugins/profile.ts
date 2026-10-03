import { parseManifest } from "../../../packages/plugin-runtime/src/manifest"

export function validateAndroidManifest(input: unknown) {
  const manifest = parseManifest(input)
  const allowed = [
    "apiVersion",
    "id",
    "name",
    "version",
    "requires",
    "views",
    "placements",
    "browser",
  ]
  if (
    Object.keys(manifest).some((key) => !allowed.includes(key)) ||
    manifest.requires?.pluginApi !== "3.0.0" ||
    !manifest.views?.length ||
    !manifest.placements?.length ||
    manifest.views.some(
      (view) =>
        view.kind !== "file" ||
        (view.access ?? "read") !== "read" ||
        (view.capabilities?.length &&
          view.capabilities.join() !== "document") ||
        view.configuration
    ) ||
    manifest.placements.some(
      (p) =>
        p.location !== "file/open" ||
        p.extensions.includes(".eidos") ||
        p.extensions.some((ext) => !/^\.[a-z0-9]{1,16}$/.test(ext))
    )
  ) {
    throw new Error(
      "Android 目前仅支持 API 3.0.0 的只读文件打开方式；不支持此插件所需的能力。"
    )
  }
  return manifest
}
