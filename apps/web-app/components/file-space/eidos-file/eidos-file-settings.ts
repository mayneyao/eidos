import type { FileSpaceEidosFileAssetFolder } from "@/apps/web-app/store/file-space-settings"

import { joinSpacePath, parentSpacePath } from "../file-path"

const SPACE_ASSET_DIRECTORY = "assets"

export function eidosFileAssetDirectory(
  eidosFilePath: string,
  policy: FileSpaceEidosFileAssetFolder
): string {
  if (policy === "space-assets") return SPACE_ASSET_DIRECTORY
  return joinSpacePath(parentSpacePath(eidosFilePath), SPACE_ASSET_DIRECTORY)
}
