import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const EXTENSIONS_DIR = path.resolve(__dirname, "../extensions/blocks")
const OUTPUT_FILE = path.resolve(__dirname, "../extensions/source-registry.ts")

const EXCLUDES = ["node_modules", "package.json", ".DS_Store"]
const ALLOWED_EXTS = [".ts", ".tsx", ".js", ".jsx"]

function getExtensionFiles(
  dir: string,
  baseDir: string = dir
): Record<string, string> {
  const results: Record<string, string> = {}
  const items = fs.readdirSync(dir)

  for (const item of items) {
    if (EXCLUDES.includes(item)) continue

    const fullPath = path.join(dir, item)
    const stat = fs.statSync(fullPath)

    if (stat.isDirectory()) {
      const subResults = getExtensionFiles(fullPath, baseDir)
      Object.assign(results, subResults)
    } else if (stat.isFile()) {
      const ext = path.extname(item)
      if (ALLOWED_EXTS.includes(ext)) {
        // Key is relative path from extension root (e.g. "index.tsx", "utils/helper.ts")
        const relPath = path.relative(baseDir, fullPath)
        // Value is relative path from source-registry.ts to the file (e.g. "./blocks/journal/index.tsx")
        // We'll compute this relative to OUTPUT_FILE later
        results[relPath] = fullPath
      }
    }
  }

  return results
}

function generateRegistry() {
  console.log("Scanning extensions...")
  if (!fs.existsSync(EXTENSIONS_DIR)) {
    console.error(`Extensions directory not found: ${EXTENSIONS_DIR}`)
    process.exit(1)
  }

  const extensions = fs.readdirSync(EXTENSIONS_DIR).filter((item) => {
    const fullPath = path.join(EXTENSIONS_DIR, item)
    return fs.statSync(fullPath).isDirectory() && !EXCLUDES.includes(item)
  })

  let imports = `/**
 * Extension Source Registry
 * 
 * AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
 * Run 'npm run gen:registry' (or similar) to update
 */

import { registerExtensionSource } from "./eject-extension"
`

  let registrations = `
/**
 * Register all built-in extension sources with their files
 */
export function initializeExtensionSources() {`

  for (const slug of extensions) {
    console.log(`Processing ${slug}...`)
    const extDir = path.join(EXTENSIONS_DIR, slug)
    const files = getExtensionFiles(extDir)

    registrations += `\n  // ${slug}\n  registerExtensionSource("${slug}", {`

    for (const [relPath, fullPath] of Object.entries(files)) {
      // Import path relative to source-registry.ts (which is in ../extensions/)
      // fullPath is absolute. OUTPUT_FILE directory is ../extensions/
      // relative: ./blocks/<slug>/<file>
      const importDir = path.dirname(OUTPUT_FILE)
      let importPath = path.relative(importDir, fullPath)
      if (!importPath.startsWith(".")) {
        importPath = "./" + importPath
      }

      // Create a unique variable name for the import
      // media_preview_index_tsx
      const safeSlug = slug.replace(/-/g, "_")
      const safePath = relPath.replace(/[\/\.-]/g, "_")
      const varName = `${safeSlug}_${safePath}`

      imports += `import ${varName} from "${importPath}?raw"\n`
      registrations += `\n    "${relPath}": ${varName},`
    }

    registrations += `\n  })\n`
  }

  registrations += `}\n`

  const content = imports + registrations
  fs.writeFileSync(OUTPUT_FILE, content)
  console.log(`Generated ${OUTPUT_FILE}`)
}

generateRegistry()
