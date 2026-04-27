import { Hono } from "hono"
import { cors } from "hono/cors"
import faviconRoute from "./routes/favicon"

export interface Env {
  // Bindings
}

const app = new Hono<{ Bindings: Env }>()

// Global CORS middleware
app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  })
)

// Add Cross-Origin-Resource-Policy for Eidos which has COEP enabled
app.use("/*", async (c, next) => {
  await next()
  c.res.headers.set("Cross-Origin-Resource-Policy", "cross-origin")
})

// Mount routes
app.route("/favicon", faviconRoute)

app.get("/", (c) => {
  return c.text("Eidos Service Kit is running.")
})

app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404)
})

export default app
