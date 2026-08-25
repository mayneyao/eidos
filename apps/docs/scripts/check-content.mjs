import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  legacyEnglishRoutes,
  legacyRedirects,
} from "../src/lib/legacy-redirects.mjs"

const docsApp = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const contentRoot = path.join(docsApp, "src/content/docs")

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

function routeFor(file) {
  const relative = path.relative(contentRoot, file).replaceAll(path.sep, "/")
  const withoutExtension = relative.replace(/\.(?:md|mdx)$/u, "")
  const pathname = withoutExtension.endsWith("/index")
    ? withoutExtension.slice(0, -"index".length)
    : `${withoutExtension}/`
  return `/${pathname}`.replaceAll(/\/{2,}/gu, "/")
}

function normalizedRoute(target) {
  const pathname = target.split(/[?#]/u, 1)[0]
  if (pathname === "/") return pathname
  return pathname.endsWith("/") ? pathname : `${pathname}/`
}

const contentFiles = (await filesUnder(contentRoot)).filter((file) =>
  /\.(?:md|mdx)$/u.test(file)
)
const routes = new Set(contentFiles.map(routeFor))
routes.add("/")
const failures = []

for (const file of contentFiles) {
  const content = await readFile(file, "utf8")
  const targets = [
    ...content.matchAll(/\]\((\/[^)\s]+)(?:\s+[^)]*)?\)/gu),
    ...content.matchAll(/\bhref=["'](\/[^"']+)["']/gu),
    ...content.matchAll(/^\s*link:\s*(\/\S+)\s*$/gmu),
  ].map((match) => match[1])
  for (const target of targets) {
    const route = normalizedRoute(target)
    if (!routes.has(route) && !(route in legacyRedirects)) {
      failures.push(`${path.relative(docsApp, file)} -> ${target}`)
    }
  }
}

const bilingualFoundations = [
  "getting-started/index.mdx",
  "getting-started/browser.mdx",
  "getting-started/eidos-lite.mdx",
  "getting-started/cli.mdx",
  "concepts/index.mdx",
  "user-guide/index.mdx",
  "user-guide/eidos-file-basics.mdx",
  "user-guide/tables-and-fields.mdx",
  "user-guide/records-and-editing.mdx",
  "user-guide/views-and-querying.mdx",
  "user-guide/import-and-export.mdx",
  "user-guide/data-safety.mdx",
  "user-guide/history-and-sync.mdx",
  "user-guide/sync.mdx",
  "user-guide/publishing.mdx",
  "user-guide/troubleshooting.mdx",
  "cli/index.mdx",
  "cli/automation-workflow.mdx",
  "cli/serve.mdx",
  "cli/publish.mdx",
  "developers/index.mdx",
  "developers/runtime-quickstart.mdx",
  "developers/runtime-and-hosts.mdx",
  "specifications/index.mdx",
  "legacy/index.mdx",
]
for (const relative of bilingualFoundations) {
  for (const localeRoot of ["", "zh-cn/"]) {
    const expected = path.join(contentRoot, localeRoot, relative)
    if (!contentFiles.includes(expected)) {
      failures.push(
        `Missing bilingual foundation page: ${localeRoot}${relative}`
      )
    }
  }
}

for (const source of Object.keys(legacyEnglishRoutes)) {
  const localized = `/zh-cn${source}`
  if (!(source in legacyRedirects) || !(localized in legacyRedirects)) {
    failures.push(`Missing legacy redirect pair: ${source}`)
  }
}

for (const [source, destination] of Object.entries(legacyRedirects)) {
  if (!routes.has(normalizedRoute(destination))) {
    failures.push(
      `Legacy redirect has no destination page: ${source} -> ${destination}`
    )
  }
}

const generatedSpecs = contentFiles.filter((file) =>
  /\/specifications\/(?:file-format|runtime|system-metadata-merge|adapter|ui|standard-views)-1-0\.md$/u.test(
    file
  )
)
if (generatedSpecs.length !== 12) {
  failures.push(
    `Expected 12 generated specification pages, found ${generatedSpecs.length}`
  )
}

if (failures.length > 0) {
  console.error(
    `Documentation content check failed:\n- ${failures.join("\n- ")}`
  )
  process.exitCode = 1
} else {
  console.log(
    `Documentation content check passed (${contentFiles.length} pages, ${Object.keys(legacyRedirects).length} redirects).`
  )
}
