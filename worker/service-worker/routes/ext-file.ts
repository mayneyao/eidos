import { extension } from "@/lib/mime/mime"
import {
  EidosFileSystemManager,
  getExternalFolderManager,
} from "@/lib/storage/eidos-file-system"

declare var self: ServiceWorkerGlobalScope

const pathnameRegex = /^\/@\/([^\/]+)\/(.*)$/
export const pathname = (url: URL) => {
  // pathname: /@/<ext-folder-name>/<path>
  return url.origin === self.location.origin && pathnameRegex.test(url.pathname)
}

export default async function handle(event: FetchEvent) {
  const url = new URL(event.request.url)
  const extFolderName = pathnameRegex.exec(url.pathname)![1]
  const efsManager = await getExternalFolderManager(extFolderName)
  return readFileFromOpfs(efsManager, url.pathname).then((file) => {
    const headers = new Headers()
    headers.append("Content-Type", file.type || getContentType(url.pathname))
    headers.append("Cross-Origin-Embedder-Policy", "require-corp")
    return new Response(file, { headers })
  })
}

async function readFileFromOpfs(
  efsManager: EidosFileSystemManager,
  pathname: string
) {
  const paths = decodeURIComponent(pathname).split("/").filter(Boolean).slice(2)
  return efsManager.getFile([...paths])
}

function getContentType(filename: string) {
  return (extension(filename) || "application/octet-stream") as string
}
