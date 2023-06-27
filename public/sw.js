// This code executes in its own worker or thread
self.addEventListener("install", event => {
  console.log("Service worker installed");
});

self.addEventListener("activate", event => {
  console.log("Service worker activated");
});


let space;
self.addEventListener('message', function(event) {
  if (event.data.type === 'space') {
    space =  event.data.data;
    console.log(space); 
  }
});

self.addEventListener('fetch', async event => {
  const url = new URL(event.request.url)
  if (url.origin === self.location.origin && url.pathname.startsWith(`/files/`)) {
    event.respondWith(readFileFromOpfs(space, url.pathname).then(file => {
      const headers = new Headers();
      headers.append('Content-Type', getContentType(url.pathname));
      return new Response(file, { headers });
    }))
  }
});

async function readFileFromOpfs(space, pathname) {
  const filename = pathname.split("/").pop()
  const opfsRoot = await navigator.storage.getDirectory();
  const spacesDirHandle = await opfsRoot.getDirectoryHandle("spaces", { create: true })
  const spaceDirHandle = await spacesDirHandle.getDirectoryHandle(space, { create: true })
  const filesDirHandle = await spaceDirHandle.getDirectoryHandle("files", { create: true })
  let existingFileHandle;
  try {
    existingFileHandle = await filesDirHandle.getFileHandle(filename);  
  } catch (error) {
    // file should be sorted in space files folder, but if not, try to find it in root files folder
    const filesDirHandle = await opfsRoot.getDirectoryHandle("files", { create: true })
    existingFileHandle = await filesDirHandle.getFileHandle(filename);  
  }
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
