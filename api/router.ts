import { initTRPC } from "@trpc/server"
import { OpenApiMeta, generateOpenApiDocument } from "trpc-openapi"
import { z } from "zod"

import { uuidv4 } from "@/lib/utils"

import { deserializedMsg, serializedMsg } from "./helper"
import { wsMap } from "./main"

const t = initTRPC.meta<OpenApiMeta>().create() /* 👈 */

export const appRouter = t.router({
  sayHello: t.procedure
    .meta({ /* 👉 */ openapi: { method: "GET", path: "/say-hello" } })
    .input(z.object({ name: z.string() }))
    .output(z.object({ greeting: z.string() }))
    .query(({ input }) => {
      const msg = serializedMsg({
        id: uuidv4(),
        data: input,
      })
      const ws = wsMap.get("worker")
      ws?.send(msg)
      return new Promise((resolve, reject) => {
        ws?.on("message", (message) => {
          const msg = deserializedMsg(message.toString())
          console.log("Received message from worker:", msg)
          resolve({ greeting: `Hello ${input.name}!` })
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
