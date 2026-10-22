import { app, nativeImage } from "electron"

/** IconManager's asynchronous macOS file lookup crashes Electron 43.2.0's
 * browser process on this path. Read the system document image directly;
 * unlike a Promise rejection, that native crash cannot be caught in JS. */
export async function filePropertiesIconDataUrl(
  absolutePath: string,
  platform: NodeJS.Platform = process.platform
): Promise<string | null> {
  try {
    const icon =
      platform === "darwin"
        ? nativeImage.createFromPath(
            "/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericDocumentIcon.icns"
          )
        : await app.getFileIcon(absolutePath, { size: "large" })
    return icon.isEmpty() ? null : icon.toDataURL({ scaleFactor: 2 })
  } catch {
    // An unavailable icon must never prevent inspecting or editing a file.
    return null
  }
}
