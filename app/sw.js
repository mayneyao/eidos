import { precacheAndRoute } from "workbox-precaching"

precacheAndRoute(self.__WB_MANIFEST)

// This code executes in its own worker or thread
self.addEventListener("install", (event) => {
  console.log("Service worker installed")
})

self.addEventListener("activate", (event) => {
  console.log("Service worker activated")
})

let space
self.addEventListener("message", function (event) {
  if (event.data.type === "space") {
    space = event.data.data
    console.log(space)
  }
})

self.addEventListener("fetch", async (event) => {
  const url = new URL(event.request.url)
  if (
    url.origin === self.location.origin &&
    url.pathname.startsWith(`/files/`)
  ) {
    event.respondWith(
      readFileFromOpfs(space, url.pathname).then((file) => {
        const headers = new Headers()
        headers.append("Content-Type", getContentType(url.pathname))
        headers.append("Cross-Origin-Embedder-Policy", "require-corp")
        return new Response(file, { headers })
      })
    )
  }
})

async function getDirHandle(_paths) {
  const paths = [..._paths]
  const opfsRoot = await navigator.storage.getDirectory()
  let dirHandle = opfsRoot
  for (let path of paths) {
    dirHandle = await dirHandle.getDirectoryHandle(path, { create: true })
  }
  return dirHandle
}

async function readFileFromOpfs(space, pathname) {
  const paths = decodeURIComponent(space + pathname).split("/")
  const filename = paths.pop()
  const dirHandle = await getDirHandle(["spaces", ...paths])
  const existingFileHandle = await dirHandle.getFileHandle(filename)
  return existingFileHandle.getFile()
}

function getContentType(filename) {
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
