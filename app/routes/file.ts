declare var self: ServiceWorkerGlobalScope

export const pathname = (url: URL) => {
  // pathname: /<space>/files/<filename>
  const pathnameRegex = /^\/([^\/]+)\/files\/(.*)$/
  return url.origin === self.location.origin && pathnameRegex.test(url.pathname)
}

export default async function handle(event: FetchEvent) {
  const url = new URL(event.request.url)
  event.respondWith(
    readFileFromOpfs(url.pathname).then((file) => {
      const headers = new Headers()
      headers.append("Content-Type", getContentType(url.pathname))
      headers.append("Cross-Origin-Embedder-Policy", "require-corp")
      return new Response(file, { headers })
    })
  )
}

const getDirHandle = async (_paths: string[]) => {
  const paths = [..._paths]
  const opfsRoot = await navigator.storage.getDirectory()
  let dirHandle = opfsRoot
  for (let path of paths) {
    dirHandle = await dirHandle.getDirectoryHandle(path, { create: true })
  }
  return dirHandle
}

async function readFileFromOpfs(pathname: string) {
  const paths = decodeURIComponent(pathname).split("/").filter(Boolean)
  const filename = paths.pop()
  const dirHandle = await getDirHandle(["spaces", ...paths])
  const existingFileHandle = await dirHandle.getFileHandle(filename!)
  return existingFileHandle.getFile()
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
