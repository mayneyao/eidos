import type { MiddlewareHandler } from "hono"
import { BucketClient } from "../bucket/s3-client"

export interface BucketBrowserOptions {
  /**
   * Get bucket credentials for the current sync provider
   */
  getCredentials: () => Promise<{
    endpoint: string
    accessKeyId: string
    secretAccessKey: string
    bucketName: string
    region?: string
  } | null>
}

/**
 * HTML template for bucket browser
 */
function renderBucketBrowserPage(params: {
  bucketName: string
  currentPath: string
  folders: string[]
  files: Array<{ key: string; size: number; lastModified?: Date }>
  error?: string
}): string {
  const { bucketName, currentPath, folders, files, error } = params

  const breadcrumbs = currentPath
    ? currentPath
        .split("/")
        .filter(Boolean)
        .reduce(
          (acc, part, index, arr) => {
            const path = arr.slice(0, index + 1).join("/") + "/"
            acc.push({ name: part, path })
            return acc
          },
          [{ name: bucketName, path: "" }] as Array<{
            name: string
            path: string
          }>
        )
    : [{ name: bucketName, path: "" }]

  const breadcrumbHtml = breadcrumbs
    .map(
      (crumb, index) =>
        `<a href="?path=${encodeURIComponent(crumb.path)}" class="breadcrumb-link">${escapeHtml(
          crumb.name
        )}</a>`
    )
    .join(' <span class="separator">/</span> ')

  const folderHtml = folders
    .map((folder) => {
      const folderName = folder.replace(currentPath, "").replace(/\/$/, "")
      return `
        <tr class="folder-row">
          <td class="icon">📁</td>
          <td><a href="?path=${encodeURIComponent(folder)}" class="folder-link">${escapeHtml(
            folderName
          )}</a></td>
          <td class="size">-</td>
          <td class="actions">-</td>
        </tr>
      `
    })
    .join("")

  const fileHtml = files
    .map((file) => {
      const fileName = file.key.replace(currentPath, "")
      const size = formatBytes(file.size)
      return `
        <tr class="file-row">
          <td class="icon">📄</td>
          <td>${escapeHtml(fileName)}</td>
          <td class="size">${size}</td>
          <td class="actions">
            <a href="/download?key=${encodeURIComponent(file.key)}" class="download-link" download>Download</a>
          </td>
        </tr>
      `
    })
    .join("")

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bucket Browser - ${escapeHtml(bucketName)}</title>
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 0;
      padding: 0;
      background: #f5f5f5;
      color: #333;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    header {
      background: #fff;
      border-bottom: 1px solid #e0e0e0;
      padding: 20px 0;
      margin-bottom: 20px;
    }
    h1 {
      margin: 0;
      font-size: 24px;
      color: #1a73e8;
    }
    .breadcrumbs {
      background: #fff;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 14px;
    }
    .breadcrumb-link {
      color: #1a73e8;
      text-decoration: none;
    }
    .breadcrumb-link:hover {
      text-decoration: underline;
    }
    .separator {
      color: #999;
      margin: 0 4px;
    }
    .content {
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid #e0e0e0;
    }
    th {
      background: #f8f9fa;
      font-weight: 600;
      font-size: 13px;
      text-transform: uppercase;
      color: #666;
    }
    tr:hover {
      background: #f8f9fa;
    }
    .icon {
      width: 40px;
      text-align: center;
      font-size: 18px;
    }
    .folder-link {
      color: #1a73e8;
      text-decoration: none;
      font-weight: 500;
    }
    .folder-link:hover {
      text-decoration: underline;
    }
    .size {
      width: 120px;
      color: #666;
      font-size: 13px;
    }
    .actions {
      width: 100px;
    }
    .download-link {
      color: #1a73e8;
      text-decoration: none;
      font-size: 13px;
      padding: 4px 12px;
      border: 1px solid #1a73e8;
      border-radius: 4px;
    }
    .download-link:hover {
      background: #1a73e8;
      color: #fff;
    }
    .empty-state {
      padding: 60px 20px;
      text-align: center;
      color: #666;
    }
    .error {
      background: #fce8e8;
      color: #c5221f;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 16px;
    }
    .bucket-info {
      font-size: 14px;
      color: #666;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <header>
    <div class="container">
      <h1>☁️ Bucket Browser</h1>
      <div class="bucket-info">Bucket: ${escapeHtml(bucketName)}</div>
    </div>
  </header>
  
  <div class="container">
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    
    <div class="breadcrumbs">
      ${breadcrumbHtml}
    </div>
    
    <div class="content">
      <table>
        <thead>
          <tr>
            <th class="icon"></th>
            <th>Name</th>
            <th class="size">Size</th>
            <th class="actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${
            currentPath
              ? `
            <tr class="folder-row">
              <td class="icon">📁</td>
              <td colspan="3">
                <a href="?path=${encodeURIComponent(
                  currentPath.split("/").slice(0, -2).join("/") + "/"
                )}" class="folder-link">..</a>
              </td>
            </tr>
          `
              : ""
          }
          ${folderHtml}
          ${fileHtml}
          ${
            !folderHtml && !fileHtml
              ? `
            <tr>
              <td colspan="4" class="empty-state">
                <p>This folder is empty</p>
              </td>
            </tr>
          `
              : ""
          }
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

/**
 * Create a Hono middleware for browsing S3-compatible buckets
 * Intercepts requests to storage.eidos.localhost
 */
export function createBucketBrowserMiddleware(
  options: BucketBrowserOptions
): MiddlewareHandler {
  return async (c, next) => {
    const url = new URL(c.req.url)
    const hostname = url.hostname

    // Only intercept storage.eidos.localhost
    if (hostname !== "storage.eidos.localhost") {
      return next()
    }

    const path = url.pathname

    // Handle file download
    if (path === "/download") {
      const key = url.searchParams.get("key")
      if (!key) {
        return c.text("Missing file key", 400)
      }

      const credentials = await options.getCredentials()
      if (!credentials) {
        return c.text("No credentials configured", 401)
      }

      try {
        const client = new BucketClient({
          endpoint: credentials.endpoint,
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          region: credentials.region,
        })

        // Generate a presigned URL or redirect to the file
        const fileUrl = `${credentials.endpoint}/${credentials.bucketName}/${key}`
        return c.redirect(fileUrl)
      } catch (error: any) {
        return c.text(`Download error: ${error.message}`, 500)
      }
    }

    // Handle bucket browser page
    if (path === "/" || path === "") {
      const credentials = await options.getCredentials()

      if (!credentials) {
        return c.html(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Bucket Browser - Not Configured</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
                background: #f5f5f5;
              }
              .message {
                text-align: center;
                padding: 40px;
                background: #fff;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              }
              h1 { color: #333; margin-bottom: 16px; }
              p { color: #666; line-height: 1.6; }
            </style>
          </head>
          <body>
            <div class="message">
              <h1>☁️ Bucket Browser</h1>
              <p>No sync credentials configured.<br>Please configure your sync provider in Settings → Sync first.</p>
            </div>
          </body>
          </html>
        `)
      }

      const currentPath = url.searchParams.get("path") || ""

      try {
        const client = new BucketClient({
          endpoint: credentials.endpoint,
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          region: credentials.region,
        })

        // List folders and files
        const { folders, files } = await listBucketContents(
          client,
          credentials.bucketName,
          currentPath
        )

        const html = renderBucketBrowserPage({
          bucketName: credentials.bucketName,
          currentPath,
          folders,
          files,
        })

        return c.html(html)
      } catch (error: any) {
        const html = renderBucketBrowserPage({
          bucketName: credentials.bucketName,
          currentPath,
          folders: [],
          files: [],
          error: error.message,
        })
        return c.html(html, 500)
      }
    }

    return next()
  }
}

/**
 * List bucket contents (folders and files) at a given prefix
 */
async function listBucketContents(
  client: BucketClient,
  bucket: string,
  prefix: string
): Promise<{
  folders: string[]
  files: Array<{ key: string; size: number; lastModified?: Date }>
}> {
  // Use the S3 client directly to list objects
  const { ListObjectsV2Command } = await import("@aws-sdk/client-s3")

  const s3Client = (client as any).client

  const command = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix,
    Delimiter: "/",
  })

  const response = await s3Client.send(command)

  const folders = (response.CommonPrefixes || [])
    .map((p: { Prefix?: string }) => p.Prefix)
    .filter((p: string | undefined): p is string => !!p)

  const files = (response.Contents || [])
    .filter((obj: { Key?: string }) => obj.Key && obj.Key !== prefix) // Exclude the prefix itself
    .map((obj: { Key: string; Size?: number; LastModified?: Date }) => ({
      key: obj.Key,
      size: obj.Size || 0,
      lastModified: obj.LastModified,
    }))

  return { folders, files }
}
