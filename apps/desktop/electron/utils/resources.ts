import path from "path"
import { app } from "electron"

/**
 * Get the absolute path to a resource file
 * Works in both development and packaged (production) modes
 */
export function getResourcePath(relativePath: string): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, relativePath)
  } else {
    return path.join(app.getAppPath(), relativePath)
  }
}
