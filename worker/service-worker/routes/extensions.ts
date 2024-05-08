import { getDirHandle } from "@/lib/storage/eidos-file-system"

declare var self: ServiceWorkerGlobalScope

export const pathname = (url: URL) => {
  return url.hostname.endsWith("ext.eidos.space")
}

export async function extHandle(event: FetchEvent) {
  const url = new URL(event.request.url)
  const extName = url.hostname.split(".")[0]
  return readFileFromOpfs(extName, url.pathname).then((file) => {
    const headers = new Headers()
    // headers.append("Content-Type", getContentType(url.pathname))
    headers.append("Cross-Origin-Embedder-Policy", "require-corp")
    return new Response(file, { headers })
  })
}

async function readFileFromOpfs(extName: string, pathname: string) {
  const paths = decodeURIComponent(pathname).split("/").filter(Boolean)
  const filename = paths.pop()
  const _paths = ["extensions", "apps", extName, ...paths]
  const dirHandle = await getDirHandle(_paths)
  const existingFileHandle = await dirHandle.getFileHandle(filename!)
  return existingFileHandle.getFile()
}
