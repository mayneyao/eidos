export type EidosLiteRendererPlatform = "darwin" | "win32" | "other"

export function rendererPlatform(
  userAgent: string = navigator.userAgent
): EidosLiteRendererPlatform {
  if (userAgent.includes("Macintosh")) return "darwin"
  if (userAgent.includes("Windows")) return "win32"
  return "other"
}
