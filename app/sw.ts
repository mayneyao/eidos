import { precacheAndRoute } from "workbox-precaching"

declare var self: ServiceWorkerGlobalScope

const getDirHandle = async (_paths: string[]) => {
  const paths = [..._paths]
  const opfsRoot = await navigator.storage.getDirectory()
  let dirHandle = opfsRoot
  for (let path of paths) {
    dirHandle = await dirHandle.getDirectoryHandle(path, { create: true })
  }
  return dirHandle
}

precacheAndRoute(self.__WB_MANIFEST)

// This code executes in its own worker or thread
self.addEventListener("install", (event) => {
  console.log("Service worker installed")
})

self.addEventListener("activate", (event) => {
  console.log("Service worker activated")
})

let space: string
self.addEventListener("message", function (event) {
  if (event.data.type === "space") {
    space = event.data.data
    console.log(space)
  }
})

function isFileUrl(pathname: string) {
  return (
    pathname.startsWith(`/${space}/files/`) || pathname.startsWith(`/files/`)
  )
}

function getFixedFieldPathname(pathname: string) {
  if (pathname.startsWith(`/files/`)) {
    return `/${space}` + pathname
  }
  return pathname
}

self.addEventListener("fetch", async (event) => {
  const url = new URL(event.request.url)
  if (url.origin === self.location.origin && isFileUrl(url.pathname)) {
    const _pathname = getFixedFieldPathname(url.pathname)
    event.respondWith(
      readFileFromOpfs(_pathname).then((file) => {
        const headers = new Headers()
        headers.append("Content-Type", getContentType(_pathname))
        headers.append("Cross-Origin-Embedder-Policy", "require-corp")
        return new Response(file, { headers })
      })
    )
  }
})

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
