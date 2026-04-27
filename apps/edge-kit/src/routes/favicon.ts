import { Hono } from "hono"
import { cors } from "hono/cors"

const app = new Hono()

// Apply CORS to this route specifically if needed,
// though we usually apply it globally in index.ts
app.use("/*", cors())

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ""
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

app.get("/", async (c) => {
  const domain = c.req.query("domain")
  const size = c.req.query("sz") || "64"
  const useBase64 = c.req.query("base64") === "true"

  if (!domain) {
    return c.json({ error: "Missing domain parameter" }, 400)
  }

  try {
    const targetUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
      domain
    )}&sz=${size}`

    // Fetch favicon from Google service
    const response = await fetch(targetUrl)

    if (!response.ok) {
      throw new Error("Failed to fetch favicon")
    }

    if (useBase64) {
      const arrayBuffer = await response.arrayBuffer()
      const base64 = arrayBufferToBase64(arrayBuffer)
      const contentType = response.headers.get("content-type") || "image/png"
      const dataUrl = `data:${contentType};base64,${base64}`

      return c.json({ url: dataUrl })
    }

    // Direct proxy response
    return new Response(response.body, {
      headers: {
        "Content-Type": response.headers.get("content-type") || "image/png",
        "Cache-Control":
          response.headers.get("cache-control") || "public, max-age=86400",
        "Cross-Origin-Resource-Policy": "cross-origin",
      },
    })
  } catch (error: any) {
    return c.json({ error: error.message || "Internal Server Error" }, 500)
  }
})

export default app
