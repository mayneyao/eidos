/**
 * Space Proxy for Eidos RPC client
 * Creates a Proxy-based interface for calling RPC methods
 * Extracted and adapted from packages/sandbox/src/sdk-inject-script.html
 */

import { createHttpTransport, onCallBack, TransportConfig } from "./transport"

/**
 * Create space proxy with Prisma-style API
 */
export function createSpaceProxy(config: TransportConfig) {
  const transport = createHttpTransport(config)

  return new Proxy(
    {},
    {
      get: (target, method: string) => {
        // Prisma-style table() API
        if (method === "table") {
          return function (tableId: string) {
            const tableMethods = [
              "create",
              "createMany",
              "findUnique",
              "findFirst",
              "findMany",
              "count",
              "update",
              "updateMany",
              "delete",
              "deleteMany",
            ]

            return new Proxy(
              {},
              {
                get(target, tableMethod: string) {
                  if (tableMethods.includes(tableMethod)) {
                    return async function (args?: any) {
                      const port = await transport.send({
                        method: `table(${tableId}).${tableMethod}`,
                        params: [args],
                      })
                      return onCallBack(port)
                    }
                  }
                  return undefined
                },
              }
            )
          }
        }

        // Namespace APIs: doc, tree, file, kv, fs, etc.
        const namespaces = [
          "doc",
          "action",
          "schema",
          "graft",
          "script",
          "extension",
          "tree",
          "view",
          "column",
          "embedding",
          "file",
          "extNode",
          "theme",
          "dataView",
          "kv",
          "fs",
          "AI",
          "ai",
          "utils",
        ]

        if (namespaces.includes(method)) {
          return new Proxy(
            {},
            {
              get(target, subMethod: string) {
                return async function (...params: any[]) {
                  const port = await transport.send({
                    method: `${method}.${subMethod}`,
                    params,
                  })
                  return onCallBack(port)
                }
              },
            }
          )
        }

        // Direct method call
        return async (...params: any[]) => {
          const port = await transport.send({
            method,
            params,
          })
          return onCallBack(port)
        }
      },
    }
  )
}
