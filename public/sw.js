// This code executes in its own worker or thread
self.addEventListener("install", event => {
  console.log("Service worker installed");
});

self.addEventListener("activate", event => {
  console.log("Service worker activated");
});

self.addEventListener('fetch', async event => {
  const url = new URL(event.request.url)
  if (url.origin === self.location.origin && url.pathname.startsWith("/files/")) {
    event.respondWith(readFileFromOpfs(url.pathname).then(file => {
      const headers = new Headers();
      headers.append('Content-Type', getContentType(url.pathname));
      return new Response(file, { headers });
    }))
  }
});

async function readFileFromOpfs(pathname) {
  const opfsRoot = await navigator.storage.getDirectory();
  const filename = pathname.split("/").pop()
  const filesDirHandle = await opfsRoot.getDirectoryHandle("files", { create: true })
  const existingFileHandle = await filesDirHandle.getFileHandle(filename);
  return existingFileHandle.getFile();
}

function getContentType(filename) {
  const extension = filename.split('.').pop();
  switch (extension) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}
