import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import http from "node:http"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"

// Local browser QA harness; production render/validation code, in-memory storage.
const root = fileURLToPath(new URL("../../../", import.meta.url))
const require = createRequire(
  path.join(root, "packages/plugin-runtime/package.json")
)
const { build } = require("esbuild")
const temporary = await fs.mkdtemp(
  path.join(os.tmpdir(), "eidos-publish-view-")
)
const output = path.join(temporary, "render.mjs")
await build({
  stdin: {
    contents:
      'export * from "./apps/eidos-publish/src/file.ts"; export * from "./apps/eidos-publish/src/canonical.ts";',
    resolveDir: root,
    loader: "ts",
  },
  banner: {
    js: 'import { createRequire as nodeRequire } from "node:module"; const require = nodeRequire(import.meta.url);',
  },
  outfile: output,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "es2022",
  keepNames: false,
})
const {
  prepareFileVersion,
  validateFileVersion,
  canonicalJsonBytes,
  canonicalSha256,
  FILE_VIEW_CSP,
} = await import(pathToFileURL(output))
const filePath = process.argv[2],
  pluginPath = process.argv[3],
  viewId = process.argv[4] ?? "map"
if (!filePath || !pluginPath)
  throw new Error(
    "Usage: node scripts/file-view-preview.mjs FILE PLUGIN [VIEW_ID]"
  )
const file = await fs.readFile(filePath),
  plugin = await fs.readFile(pluginPath)
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex")
const sourcePath = "files/" + path.basename(filePath)
const files = [
  {
    path: sourcePath,
    role: "entrypoint",
    mediaType: "application/gpx+xml",
    bytes: String(file.length),
    sha256: digest(file),
  },
  {
    path: "plugins/view.eidos-plugin",
    role: "plugin",
    mediaType: "application/octet-stream",
    bytes: String(plugin.length),
    sha256: digest(plugin),
  },
]
const manifest = {
  spec: "eidos.publish/source-bundle@1",
  mediaType: "application/vnd.eidos.file",
  entrypoint: sourcePath,
  files,
  assetReferences: [],
  presentation: { kind: "plugin-view", pluginPath: files[1].path, viewId },
}
const objects = new Map()
const bucket = {
  async put(key, bytes, options = {}) {
    objects.set(key, {
      bytes: new Uint8Array(bytes),
      customMetadata: options.customMetadata ?? {},
    })
    return {}
  },
  async get(key) {
    const obj = objects.get(key)
    return obj
      ? {
          size: obj.bytes.length,
          customMetadata: obj.customMetadata,
          text: async () => new TextDecoder().decode(obj.bytes),
          arrayBuffer: async () => obj.bytes.buffer,
        }
      : null
  },
  async head(key) {
    return this.get(key)
  },
}
for (const [index, bytes] of [file, plugin].entries())
  await bucket.put(
    "tenants/test/objects/sha256/" +
      files[index].sha256.slice(0, 2) +
      "/" +
      files[index].sha256,
    bytes,
    {
      customMetadata: {
        contentSha256: files[index].sha256,
        contentBytes: String(bytes.length),
      },
    }
  )
await bucket.put("manifest", canonicalJsonBytes(manifest))
const version = {
  publicationId: "00000000-0000-4000-8000-000000000001",
  versionId: "00000000-0000-4000-8000-000000000002",
  sourceManifestKey: "manifest",
  sourceManifestSha256: await canonicalSha256(manifest),
}
await validateFileVersion({ PUBLISH_OBJECTS: bucket }, "test", version)
const prepared = await prepareFileVersion(
  { PUBLISH_OBJECTS: bucket },
  {
    reserveStaticArtifacts: async () => ({ ok: true }),
    markStaticArtifactsReady: async () => ({ ok: true }),
  },
  "test",
  "track",
  version
)
const html = await (await bucket.get(prepared.artifact.objectKey)).text()
const server = http.createServer((request, response) => {
  if (request.url === "/track") {
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": FILE_VIEW_CSP,
    })
    response.end(html)
  } else if (request.url?.startsWith("/_eidos/files/track/")) {
    response.writeHead(200, {
      "Content-Type": "application/gpx+xml",
      "Content-Length": file.length,
      "Content-Disposition": "attachment",
    })
    response.end(file)
  } else {
    response.writeHead(404)
    response.end()
  }
})
server.listen(0, "127.0.0.1", () =>
  console.log("Preview http://127.0.0.1:" + server.address().port + "/track")
)
process.on("SIGTERM", () => {
  server.close()
  void fs.rm(temporary, { recursive: true, force: true })
})
