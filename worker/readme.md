Eidos use `Web worker` and `Service worker` to do some important work in background.

## Web worker

sqlite-wasm run in web worker which handle all database operation. query, insert, update, delete, etc.

request-response model is used to communicate between main thread and web worker.

react component => react hooks => sqlite-wasm => OPFS

## Service worker

service worker like a Web server in browser. it can handle request and response.

- cache static files
- handle request from client, proxy files from OPFS.
  - `http://eidos.space/myspace/files/abc.jpg` => /spaces/myspace/files/abc.jpg
-
