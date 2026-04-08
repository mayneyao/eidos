import path from "path"
import { app } from "electron"
import { getInfoFromExtensionUrl } from "@/lib/utils"
import { getOrSetDataSpace } from "../data-space"
export function getResourcePath(relativePath: string): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, relativePath)
  } else {
    return path.join(app.getAppPath(), relativePath)
  }
}

export const getExtensionByUrl = async (url: string) => {
  const { id, space } = getInfoFromExtensionUrl(url)
  const dataspace = await getOrSetDataSpace(space)
  if (!dataspace) {
    throw new Error(`Data space ${space} not found.`)
  }
  const extension = await dataspace.script.get(id)
  if (!extension) {
    throw new Error(`Extension ${id} not found.`)
  }
  return extension
}
