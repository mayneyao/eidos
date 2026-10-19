/** The host-owned catalog for the whole Space. Legacy catalogs remain independent. */
export const SPACE_FILE_METADATA_PATH = ".eidos/files.eidos"

export function normalizeFileMetadataDirectory(directory: string): string {
  if (!directory) return ""
  if (
    directory.startsWith("/") ||
    /[\\\u0000-\u001f:]/u.test(directory) ||
    directory
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          part.toLowerCase() === ".eidos" ||
          part.toLowerCase() === ".graft"
      )
  )
    throw new Error("Invalid file metadata directory")
  return directory
}
