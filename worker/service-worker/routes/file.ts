import { isInkServiceMode } from "@/lib/log"
import { efsManager } from "@/lib/storage/eidos-file-system"

declare var self: ServiceWorkerGlobalScope

export const pathname = (url: URL) => {
  // pathname: /<space>/files/<filename>
  const pathnameRegex = /^\/([^\/]+)\/files\/(.*)$/
  return url.origin === self.location.origin && pathnameRegex.test(url.pathname)
}

export default async function handle(event: FetchEvent) {
  const url = new URL(event.request.url)
  if (isInkServiceMode) {
    // /<space-name>/files/<filename> => /files/<filename>
    const newPathname = '/files' + url.pathname.split('/files')[1];
    const newUrl = new URL(newPathname, url.origin)
    console.log("new url", newUrl.toString())
    return fetch(newUrl.toString())
  }
  return readFileFromOpfs(url.pathname).then((file) => {
    const headers = new Headers()
    headers.append("Content-Type", file.type || getContentType(url.pathname))
    headers.append("Cross-Origin-Embedder-Policy", "require-corp")
    return new Response(file, { headers })
  })
}

async function readFileFromOpfs(pathname: string) {
  const paths = decodeURIComponent(pathname).split("/").filter(Boolean)
  return efsManager.getFile(["spaces", ...paths])
}

function getContentType(filename: string) {
  const extension = filename.split(".").pop()
  switch (extension) {
    case "png":
      return "image/png"
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    case "gif":
      return "image/gif"
    case "pdf":
      return "application/pdf"
    default:
      return "application/octet-stream"
  }
}
