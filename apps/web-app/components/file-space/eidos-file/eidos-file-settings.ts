import type { FileSpaceEidosFileAssetFolder } from "@/apps/web-app/store/file-space-settings"

import { joinSpacePath, parentSpacePath } from "../file-path"

const SPACE_ASSET_DIRECTORY = "assets"

export function eidosFileAssetDirectory(
  eidosFilePath: string,
  _policy: FileSpaceEidosFileAssetFolder
): string {
  // File 1.0 relative URIs are scoped to the directory containing the
  // current .eidos source. The legacy preference cannot broaden that root.
  return joinSpacePath(parentSpacePath(eidosFilePath), SPACE_ASSET_DIRECTORY)
}
