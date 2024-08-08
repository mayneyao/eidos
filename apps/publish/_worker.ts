// Note: You would need to compile your TS into JS and output it as a `_worker.js` file. We do not read `_worker.ts`

import { DataSpace } from "@/worker/web-worker/DataSpace"
import { ExportedHandler, Fetcher, KVNamespace, Request } from "@cloudflare/workers-types"

import { ServerDatabase } from "./lib/ServerDatabase"
import { handleFunctionCall, IHttpSendData } from "./lib/handleFunctionCall"


interface Env {
  ASSETS: Fetcher
  DOMAIN_DB_INFO: KVNamespace
}

export default {
  async fetch(request: Request, env: any): Promise<any> {
    const url = new URL(request.url)
    const subdomain = url.hostname.split(".")[0]
    const domainDbInfo: {
      name: string,
      url: string,
      readToken: string,
      writeToken?: string,
    } = await env.DOMAIN_DB_INFO.get(subdomain, {
      type: "json",
    })
    if (!domainDbInfo) {
      return new Response("Not found", {
        status: 404,
      })
    }
    const serverDb = new ServerDatabase(domainDbInfo.url, domainDbInfo.readToken)
    const dataSpace = new DataSpace({
      db: serverDb as any,
      activeUndoManager: false,
      dbName: "read",
      context: {
        setInterval: undefined,
      },
    })

    if (url.pathname.startsWith("/server/api")) {
      const req = await request.json<IHttpSendData>()
      let result = "url: " + request.url + "\n"
      for (const header of request.headers) {
        result += "header: " + header + "\n"
      }
      const res = await handleFunctionCall(req.data as any, dataSpace)
      return new Response(JSON.stringify(res), {
        headers: {
          "content-type": "application/json",
        },
      })
    }
    // Otherwise, serve the static assets.
    // Without this, the Worker will error and no assets will be served.
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
