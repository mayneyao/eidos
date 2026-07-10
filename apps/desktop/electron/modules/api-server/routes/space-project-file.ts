import { SpaceFiles, SpaceFilesError } from "@eidos.space/file-space"

export interface SpaceProjectFileErrorResponse {
  message: string
  status: 400 | 403 | 404 | 500
}

export async function resolveSpaceProjectFilePath(
  spaceRoot: string,
  encodedRelativePath: string
): Promise<string> {
  let relativePath: string
  try {
    relativePath = decodeURIComponent(encodedRelativePath)
  } catch {
    throw new SpaceFilesError("invalid-path", "Invalid encoded Space file path")
  }
  return new SpaceFiles(spaceRoot).getSystemPath(relativePath)
}

export function getSpaceProjectFileErrorResponse(
  error: unknown
): SpaceProjectFileErrorResponse {
  if (error instanceof SpaceFilesError) {
    if (error.code === "not-found") {
      return { message: "Space file not found", status: 404 }
    }
    if (error.code === "invalid-path" || error.code === "path-outside-space") {
      return { message: "Access denied", status: 403 }
    }
  }
  return { message: "Unable to serve Space file", status: 500 }
}
