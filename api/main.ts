import http from "http"
import { createOpenApiHttpHandler } from "trpc-openapi"
import { WebSocketServer } from "ws"

import { wsMap } from "./helper"
import { appRouter } from "./router"

const server = http.createServer(
  createOpenApiHttpHandler({
    router: appRouter,
    createContext: undefined,
    responseMeta: undefined,
    onError: undefined,
    maxBodySize: undefined
  })
)

export const wss = new WebSocketServer({ server })

// Connection from worker and server
wss.on("connection", (ws) => {
  console.log("Worker connected")
  wsMap.set("worker", ws)
})

server.listen(3333)
export { wsMap }
