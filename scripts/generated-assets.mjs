import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const definitions = {
  quickjs: {
    inputs: [
      "packages/eidos-file/src",
      "packages/eidos-file/package.json",
      "scripts/build-quickjs.mjs",
      "scripts/generated-assets.mjs",
    ],
    output: "packages/eidos-file/generated/quickjs",
  },
  serve: {
    inputs: [
      "packages/eidos-file/src",
      "packages/eidos-file-ui/src",
      "packages/eidos-file-ui/vite-source-aliases.ts",
      "packages/eidos-file-ui/package.json",
      "packages/eidos-file/package.json",
      "packages/eidos-file-serve/src",
      "packages/eidos-file-serve/index.html",
      "packages/eidos-file-serve/package.json",
      "packages/eidos-file-serve/vite.config.ts",
      "packages/markdown/src",
      "packages/markdown/vite-source-aliases.ts",
      "packages/markdown/package.json",
      "packages/plugin-runtime/src",
      "packages/plugin-runtime/package.json",
      "scripts/generated-assets.mjs",
    ],
    output: "packages/eidos-file-serve/generated/ui",
  },
}

async function snapshot(roots) {
  const files = {}
  async function visit(relative) {
    const absolute = path.join(root, relative)
    if ((await fs.stat(absolute)).isDirectory()) {
      for (const name of (await fs.readdir(absolute)).sort()) {
        if (name !== "manifest.json") await visit(`${relative}/${name}`)
      }
    } else {
      const bytes = await fs.readFile(absolute)
      const content = /\.(?:[cm]?js|tsx?|json|html|css|svg|sql|md)$/u.test(
        relative
      )
        ? bytes.toString("utf8").replace(/\r\n/gu, "\n")
        : bytes
      files[relative] = createHash("sha256").update(content).digest("hex")
    }
  }
  for (const relative of roots) await visit(relative)
  return { roots, files }
}

export async function recordGeneratedAssets(kind) {
  const definition = definitions[kind]
  if (!definition) throw new Error(`Unknown generated asset kind: ${kind}`)
  const manifest = {
    inputs: await snapshot(definition.inputs),
    outputs: await snapshot([definition.output]),
  }
  await fs.writeFile(
    path.join(root, definition.output, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n"
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await recordGeneratedAssets(process.argv[2])
}
