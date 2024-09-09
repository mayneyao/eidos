import { DataSpace } from "@/worker/web-worker/DataSpace";
import { DurableObjectNamespace, DurableObjectState, ExportedHandler, KVNamespace, Request } from "@cloudflare/workers-types";
import { IHttpSendData } from "./handleFunctionCall";
import { EidosSQLiteServerDatabase, EidosSQLiteServerDomainDbInfo } from "./sqlite-provider/eidos-sqlite-server";
import { SQLiteCloudDomainDbInfo, SQLiteCloudServerDatabase } from "./sqlite-provider/sqlite-clound";
import { TursoDomainDbInfo, TursoServerDatabase } from "./sqlite-provider/turso";
import { BaseServerDatabase } from "@/lib/sqlite/interface";
import { handleFunctionCall } from "@/lib/rpc";


interface Env {
  DOMAIN_DB_INFO: KVNamespace
  DATA_SPACE: DurableObjectNamespace
}

type DomainDbInfo = TursoDomainDbInfo | SQLiteCloudDomainDbInfo | EidosSQLiteServerDomainDbInfo

export class DataSpaceObject {
  private dataSpace: DataSpace | null = null;
  private domainDbInfo: DomainDbInfo | null = null;

  constructor(private state: DurableObjectState, private env: Env) { }

  async initialize(subdomain: string) {
    if (!this.domainDbInfo) {
      this.domainDbInfo = await this.env.DOMAIN_DB_INFO.get(subdomain, {
        type: "json",
      });
      if (!this.domainDbInfo) {
        throw new Error("Domain not found");
      }
    }

    if (!this.dataSpace) {
      let serverDb: BaseServerDatabase
      switch (this.domainDbInfo.type) {
        case "turso":
          serverDb = new TursoServerDatabase(this.domainDbInfo.config);
          break;
        case "sqlitecloud":
          serverDb = new SQLiteCloudServerDatabase(this.domainDbInfo.config);
          break;
        case "eidosSqliteServer":
          serverDb = new EidosSQLiteServerDatabase(this.domainDbInfo.config);
          break;
        default:
          throw new Error("Unsupported database type");
      }
      this.dataSpace = new DataSpace({
        db: serverDb as any,
        activeUndoManager: false,
        dbName: "read",
        context: {
          setInterval: undefined,
        },
      });
    }
  }

  private getCacheKey(req: IHttpSendData): string {
    const { id, type, data: { userId, ...rest } } = req;
    const key = JSON.stringify({ type, data: rest });
    return `https://cache-key/${encodeURIComponent(key)}`;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    const subdomain = url.hostname.split(".")[0];

    await this.initialize(subdomain);

    if (!this.dataSpace || !this.domainDbInfo) {
      return new Response("Internal Server Error", { status: 500 });
    }

    const req = await request.json() as IHttpSendData;

    const dbInfo = await this.env.DOMAIN_DB_INFO.get(subdomain, {
      type: "json",
    }) as DomainDbInfo;

    const cacheKey = this.getCacheKey(req);
    const cacheName = `${subdomain}-${dbInfo.config.version || "default"}`;
    const cache = await caches.open(cacheName);

    // Try to get the response from cache
    let response = await cache.match(cacheKey);

    if (!response) {
      try {
        const res = await handleFunctionCall(req.data as any, this.dataSpace);
        response = new Response(JSON.stringify({
          status: "success",
          result: res,
        }), {
          headers: {
            "content-type": "application/json",
            "Cache-Control": "max-age=3600", // Cache for 1 hour
          },
        });

        // Store the response in the cache
        await cache.put(cacheKey, response.clone());
      } catch (error) {
        response = new Response(JSON.stringify({
          status: "error",
          result: error instanceof Error ? error.message : "Unknown error",
        }), {
          headers: {
            "content-type": "application/json",
          },
        });
      }
    }

    return response;
  }
}


export default {
  async fetch(request, env, ctx): Promise<any> {
    let id = env.DATA_SPACE.idFromName(new URL(request.url).pathname);
    let stub = env.DATA_SPACE.get(id);
    let response = await stub.fetch(request);
    return response;
  },
} satisfies ExportedHandler<Env>;