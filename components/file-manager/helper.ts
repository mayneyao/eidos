import { getFileType } from "@/lib/mime/mime"

export const getDragFileInfo = (data?: string) => {
  if (!data) {
    return
  }

  if (data.startsWith("eidos::")) {
    const url = data.replace("eidos::", "")
    const type = (getFileType(url) || "unknown") as string
    return {
      url,
      type,
    }
  } else {
    return
  }
}
export const getDragFileUrl = (
  dataTransfer: DataTransfer | null
):
  | undefined
  | {
      url: string
      type: string
    } => {
  const data = dataTransfer?.getData("text/plain")

  return getDragFileInfo(data)
}

export const makeDataTransferData = (url: string) => {
  return `eidos::${url}`
}
