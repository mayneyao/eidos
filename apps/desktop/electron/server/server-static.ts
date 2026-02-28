import type { ReadStream, Stats } from "fs"
import fs from "fs"
import type { Env, MiddlewareHandler } from "hono"
import { getMimeType } from "hono/utils/mime"
import path from "path"

export type ServeStaticOptions<E extends Env = Env> = {
  /**
   * Absolute path to the directory root where static files are located (used when 'path' is not provided).
   * IMPORTANT: This path MUST be correctly resolved to the location within the AppImage/asar if applicable.
   * e.g., /tmp/.mount_Eidos-XXXX/resources/app.asar/dist
   */
  root?: string // Make root optional if path is provided
  /**
   * Optional absolute path to a specific file to serve, ignoring the request path.
   * Takes precedence over 'root'.
   */
  path?: string
  index?: string // default is 'index.html', used only with 'root'
  // onNotFound?: (path: string, c: Context<E>) => void | Promise<void>; // Optional: Add back if needed
}

// Helper to create ReadableStream from Node stream (needed by Hono)
const createStreamBody = (stream: ReadStream) => {
  const body = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) => {
        controller.enqueue(chunk)
      })
      stream.on("end", () => {
        controller.close()
      })
      stream.on("error", (err) => {
        // Important to handle stream errors
        console.error("Error reading file stream:", err)
        controller.error(err)
      })
    },
    cancel() {
      stream.destroy()
    },
  })
  return body
}

export const serveStatic = (
  options: ServeStaticOptions = {}
): MiddlewareHandler => {
  // Validate options: Must have root OR path
  if (!options.root && !options.path) {
    throw new Error(
      "serveStatic middleware requires either a root or a path option."
    )
  }
  if (options.path && !path.isAbsolute(options.path)) {
    console.warn(`serveStatic path option "${options.path}" is not absolute.`)
    // It's generally required to be absolute when specified directly
  }
  if (options.root && !options.path && !path.isAbsolute(options.root)) {
    console.warn(
      `serveStatic root path "${options.root}" is not absolute. This might cause issues, especially in packaged apps.`
    )
  }

  const indexFile = options.index ?? "index.html"

  return async (c, next) => {
    // Only handle GET and HEAD methods
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      return next()
    }

    // Do nothing if Response is already set
    if (c.finalized) {
      return next()
    }

    let absolutePath: string
    let stats: Stats | undefined

    // --- Logic Branch: Use specific path OR determine path from root ---
    if (options.path) {
      // ** CASE 1: Specific path option is provided **
      absolutePath = options.path
      try {
        // Check if the specific file exists and is a file
        stats = fs.statSync(absolutePath)
        if (!stats.isFile()) {
          console.error(
            `serveStatic: Provided path "${absolutePath}" is not a file.`
          )
          stats = undefined // Treat as not found
        }
      } catch (error: any) {
        console.error(
          `serveStatic: Error accessing provided path "${absolutePath}": ${error.code || error.message}`
        )
        stats = undefined // Treat as not found
      }
    } else if (options.root) {
      // ** CASE 2: Root option is provided, determine path from request **
      let requestedPath: string
      try {
        requestedPath = decodeURIComponent(c.req.path)
      } catch (e) {
        return next() // Invalid URI encoding
      }

      // Prevent path traversal
      if (requestedPath.includes("..")) {
        console.warn(`Path traversal attempt detected: ${requestedPath}`)
        return next()
      }

      const relativePath = requestedPath.startsWith("/")
        ? requestedPath.substring(1)
        : requestedPath
      // Use temporary variable for path resolution based on root
      let resolvedPath = path.join(options.root, relativePath)

      try {
        let tempStats = fs.statSync(resolvedPath)
        if (tempStats.isDirectory()) {
          // If directory, try index file
          resolvedPath = path.join(resolvedPath, indexFile)
          tempStats = fs.statSync(resolvedPath) // Stat the index file path
        }
        // If it's a file now, assign to main variables
        if (tempStats.isFile()) {
          absolutePath = resolvedPath
          stats = tempStats
        } else {
          // It wasn't a file or the index file wasn't found/a file
          stats = undefined
        }
      } catch (error: any) {
        // File/dir doesn't exist or index file check failed
        stats = undefined
      }
    } else {
      // This case should be caught by the initial validation
      return next()
    }
    // --- End of Logic Branch ---

    // If no valid file stats were obtained by either branch, proceed to next middleware
    if (!stats) {
      // await options.onNotFound?.(options.path || requestedPath, c); // Decide which path to pass to handler
      return next()
    }

    // --- File found (stats is valid), prepare and send response ---
    // (Keep the existing header setting and response streaming logic from here)
    const mimeType = getMimeType(absolutePath!) // absolutePath is guaranteed non-null if stats is valid
    if (mimeType) {
      c.header("Content-Type", mimeType)
    }
    c.header("Accept-Ranges", "bytes")
    const size = stats.size

    if (c.req.method === "HEAD") {
      c.header("Content-Length", size.toString())
      return c.body(null, 200)
    }

    const rangeHeader = c.req.header("range")
    if (rangeHeader && rangeHeader.startsWith("bytes=")) {
      const range = rangeHeader.replace(/bytes=/, "").split("-", 2)
      const startStr = range[0]
      const endStr = range[1]

      const start = startStr ? parseInt(startStr, 10) : 0
      let end = endStr ? parseInt(endStr, 10) : size - 1

      if (
        isNaN(start) ||
        isNaN(end) ||
        start < 0 ||
        end < 0 ||
        start > end ||
        start >= size
      ) {
        c.header("Content-Range", `bytes */${size}`)
        return c.body("Range Not Satisfiable", 416)
      }

      if (end >= size) {
        end = size - 1
      }

      const chunkSize = end - start + 1
      const stream = fs.createReadStream(absolutePath!, { start, end }) // absolutePath is guaranteed non-null

      c.header("Content-Length", chunkSize.toString())
      c.header("Content-Range", `bytes ${start}-${end}/${size}`)

      return c.body(createStreamBody(stream), 206)
    }

    c.header("Content-Length", size.toString())
    const stream = fs.createReadStream(absolutePath!) // absolutePath is guaranteed non-null
    return c.body(createStreamBody(stream), 200)
  }
}
