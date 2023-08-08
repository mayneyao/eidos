import { initTRPC } from "@trpc/server"
import { OpenApiMeta, generateOpenApiDocument } from "trpc-openapi"
import { z } from "zod"

import { uuidv4 } from "@/lib/utils"

import { deserializedMsg, msgDataType, serializedMsg } from "./helper"
import { wsMap } from "./main"

const t = initTRPC.meta<OpenApiMeta>().create() /* 👈 */

export const appRouter = t.router({
  rpc: t.procedure
    .meta({ /* 👉 */ openapi: { method: "POST", path: "/rpc" } })
    .input(msgDataType)
    .output(z.any())
    .query(({ input }) => {
      const msgId = uuidv4()
      const msg = serializedMsg({
        id: msgId,
        data: input,
      })
      const ws = wsMap.get("worker")
      ws?.send(msg)
      return new Promise((resolve, reject) => {
        ws?.on("message", (message) => {
          const msg = deserializedMsg(message.toString())
          if (msg.id == msgId) {
            resolve(msg)
          }
        })
      })
    }),
})

// export type AppRouter = typeof appRouter

export const getOpenApiDocument = () =>
  generateOpenApiDocument(appRouter, {
    title: "tRPC OpenAPI",
    version: "1.0.0",
    baseUrl: "http://localhost:3001",
    docsUrl: "/docs",
  })
