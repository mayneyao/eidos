import { access, readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const docsApp = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const outputRoot = path.join(docsApp, "dist")

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name)
      return entry.isDirectory() ? filesUnder(target) : [target]
    })
  )
  return files.flat()
}

function outputForRoute(route) {
  if (route === "/") return path.join(outputRoot, "index.html")
  const relative = route.replace(/^\//u, "").replace(/\/$/u, "")
  return path.join(outputRoot, relative, "index.html")
}

function decodeAttribute(value) {
  return value.replaceAll("&amp;", "&")
}

const htmlFiles = (await filesUnder(outputRoot)).filter((file) =>
  file.endsWith(".html")
)
const failures = []
const checkedFragments = new Set()

for (const sourceFile of htmlFiles) {
  const source = await readFile(sourceFile, "utf8")
  for (const match of source.matchAll(/\bhref="([^"]+)"/gu)) {
    const href = decodeAttribute(match[1])
    if (!href.startsWith("/") || href.startsWith("//")) continue
    const [pathname, fragment] = href.split("#", 2)
    const cleanPath = pathname.split("?", 1)[0]
    if (/\.[a-z0-9]+$/iu.test(cleanPath)) continue
    const target = outputForRoute(cleanPath || "/")
    try {
      await access(target)
    } catch {
      failures.push(`${path.relative(outputRoot, sourceFile)} -> ${href}`)
      continue
    }
    if (!fragment) continue
    const fragmentKey = `${target}#${fragment}`
    if (checkedFragments.has(fragmentKey)) continue
    checkedFragments.add(fragmentKey)
    const targetHtml = await readFile(target, "utf8")
    const decodedFragment = decodeURIComponent(fragment)
    if (!targetHtml.includes(`id="${decodedFragment}"`)) {
      failures.push(
        `${path.relative(outputRoot, sourceFile)} -> missing fragment ${href}`
      )
    }
  }
}

for (const route of [
  "/specifications/file-format-1-0/",
  "/specifications/runtime-1-0/",
  "/specifications/adapter-1-0/",
  "/specifications/ui-1-0/",
  "/zh-cn/specifications/file-format-1-0/",
  "/zh-cn/specifications/runtime-1-0/",
  "/zh-cn/specifications/adapter-1-0/",
  "/zh-cn/specifications/ui-1-0/",
]) {
  try {
    await access(outputForRoute(route))
  } catch {
    failures.push(`Missing generated specification route: ${route}`)
  }
}

if (failures.length > 0) {
  console.error(`Documentation build check failed:\n- ${failures.join("\n- ")}`)
  process.exitCode = 1
} else {
  console.log(
    `Documentation build check passed (${htmlFiles.length} HTML files, ${checkedFragments.size} fragments).`
  )
}
