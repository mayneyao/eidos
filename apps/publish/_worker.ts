// Note: You would need to compile your TS into JS and output it as a `_worker.js` file. We do not read `_worker.ts`
import { DurableObjectNamespace, ExportedHandler, Fetcher, KVNamespace, R2Bucket, Request } from "@cloudflare/workers-types"

import { DataSpaceObject } from "./lib/DataSpaceObject"

interface Env {
  ASSETS: Fetcher
  DOMAIN_DB_INFO: KVNamespace
  FILES: R2Bucket
  DATA_SPACE: DurableObjectNamespace
}

function objectNotFound(objectName: string): Response {
  return new Response(`<html><body>R2 object "<b>${objectName}</b>" not found</body></html>`, {
    status: 404,
    headers: {
      'content-type': 'text/html; charset=UTF-8'
    }
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<any> {
    const url = new URL(request.url)
    const subdomain = url.hostname.split(".")[0]
    const pathnameRegex = /^\/([^\/]+)\/files\/(.*)$/
    // handle files
    if (pathnameRegex.test(url.pathname)) {
      const newPathname = '/files' + url.pathname.split('/files')[1];
      const objectName = `${subdomain}${newPathname}`
      if (request.method === 'GET') {
        const object = await env.FILES.get(objectName, {
          range: request.headers,
          onlyIf: request.headers,
        }) as any

        if (object === null) {
          return objectNotFound(objectName)
        }

        const headers = new Headers() as any
        object.writeHttpMetadata(headers)
        headers.set('etag', object.httpEtag)
        if (object.range) {
          headers.set("content-range", `bytes ${object.range.offset}-${object.range.end ?? object.size - 1}/${object.size}`)
        }
        const status = object.body ? (request.headers.get("range") !== null ? 206 : 200) : 304
        return new Response(object.body, {
          headers,
          status
        })
      }

      const object = await env.FILES.head(objectName)

      if (object === null) {
        return objectNotFound(objectName)
      }

      const headers = new Headers() as any
      object.writeHttpMetadata(headers)
      headers.set('etag', object.httpEtag)
      return new Response(null, {
        headers,
      })
    }
    // handle server api
    if (url.pathname.startsWith("/server/api")) {
      const id = env.DATA_SPACE.idFromName(subdomain);
      const dataSpaceObject = env.DATA_SPACE.get(id);
      return dataSpaceObject.fetch(request);
    }
    // Otherwise, serve the static assets.
    // Without this, the Worker will error and no assets will be served.
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>

export { DataSpaceObject }
