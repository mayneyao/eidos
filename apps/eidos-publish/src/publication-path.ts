// Publication paths are relative to a site's root, not filesystem paths.
export function validPublicationPath(value: string): boolean {
  return (
    value.length > 0 &&
    new TextEncoder().encode(value).length <= 1024 &&
    value
      .split("/")
      .every(
        (segment) =>
          segment !== "." &&
          segment !== ".." &&
          segment.trim() === segment &&
          new TextEncoder().encode(segment).length <= 255 &&
          /^[\p{L}\p{N} _().-]+$/u.test(segment)
      ) &&
    !["_eidos", "assets", ".well-known"].includes(value.split("/")[0]!)
  )
}
export function publicationUrlPath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/")
}
export function decodePublicationPath(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value)
    return validPublicationPath(decoded) ? decoded : null
  } catch {
    return null
  }
}
