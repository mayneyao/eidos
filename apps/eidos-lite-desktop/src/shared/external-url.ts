export function requiredEidosLiteExternalUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid external URL")
  if (value.length === 0 || value.length > 8_192 || value !== value.trim()) {
    throw new Error("Invalid external URL")
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("Invalid external URL")
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new Error("External URLs require HTTP or HTTPS without credentials")
  }
  return value
}
