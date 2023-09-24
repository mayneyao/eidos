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

const getDirHandle = async (_paths: string[]) => {
  const paths = [..._paths]
  const opfsRoot = await navigator.storage.getDirectory()
  let dirHandle = opfsRoot
  for (let path of paths) {
    dirHandle = await dirHandle.getDirectoryHandle(path, { create: true })
  }
  return dirHandle
}

async function readFileFromOpfs(extName: string, pathname: string) {
  const paths = decodeURIComponent(pathname).split("/").filter(Boolean)
  const filename = paths.pop()
  const _paths = ["extensions", extName, ...paths]
  console.log(_paths)
  const dirHandle = await getDirHandle(_paths)
  const existingFileHandle = await dirHandle.getFileHandle(filename!)
  return existingFileHandle.getFile()
}
