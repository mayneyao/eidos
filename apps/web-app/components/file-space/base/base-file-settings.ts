import type { FileSpaceBaseAssetFolder } from "@/apps/web-app/store/file-space-settings"

import { joinSpacePath, parentSpacePath } from "../file-path"

const SPACE_ASSET_DIRECTORY = "assets"

export function baseAssetDirectory(
  baseFilePath: string,
  policy: FileSpaceBaseAssetFolder
): string {
  if (policy === "space-assets") return SPACE_ASSET_DIRECTORY
  return joinSpacePath(parentSpacePath(baseFilePath), SPACE_ASSET_DIRECTORY)
}
