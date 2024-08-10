// Note: You would need to compile your TS into JS and output it as a `_worker.js` file. We do not read `_worker.ts`

import { DataSpace } from "@/worker/web-worker/DataSpace"
import { ExportedHandler, Fetcher, KVNamespace, R2Bucket, Request } from "@cloudflare/workers-types"

import { ServerDatabase } from "./lib/ServerDatabase"
import { handleFunctionCall, IHttpSendData } from "./lib/handleFunctionCall"


interface Env {
  ASSETS: Fetcher
  DOMAIN_DB_INFO: KVNamespace
  FILES: R2Bucket
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

    // handle files
    if (url.pathname.startsWith("/files")) {
      const objectName = `${subdomain}${url.pathname}`
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
    const domainDbInfo: {
      name: string,
      url: string,
      readToken: string,
      writeToken?: string,
    } | null = await env.DOMAIN_DB_INFO.get(subdomain, {
      type: "json",
    })
    // handle server api
    if (!domainDbInfo) {
      return new Response("Not found", {
        status: 404,
      })
    }
    if (url.pathname.startsWith("/server/api")) {
      const serverDb = new ServerDatabase(domainDbInfo.url, domainDbInfo.readToken)
      const dataSpace = new DataSpace({
        db: serverDb as any,
        activeUndoManager: false,
        dbName: "read",
        context: {
          setInterval: undefined,
        },
      })
      const req = await request.json<IHttpSendData>()
      let result = "url: " + request.url + "\n"
      for (const header of request.headers) {
        result += "header: " + header + "\n"
      }
      try {
        const res = await handleFunctionCall(req.data as any, dataSpace)
        return new Response(JSON.stringify({
          status: "success",
          result: res,
        }), {
          headers: {
            "content-type": "application/json",
          },
        })
      } catch (error) {
        return new Response(JSON.stringify({
          status: "error",
          result: error instanceof Error ? error.message : "未知错误",
        }), {
          headers: {
            "content-type": "application/json",
          },
        })
      }
    }
    // Otherwise, serve the static assets.
    // Without this, the Worker will error and no assets will be served.
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
