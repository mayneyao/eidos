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
let markdownPages = 0

try {
  const headers = await readFile(path.join(outputRoot, "_headers"), "utf8")
  if (
    !headers.includes("/_astro/*") ||
    !headers.includes("Cache-Control: public, max-age=31536000, immutable")
  ) {
    failures.push(
      "Missing immutable cache policy for fingerprinted Astro assets"
    )
  }
  if (/^\/\*\s+[\s\S]*immutable/mu.test(headers)) {
    failures.push("Immutable caching must not be applied to every route")
  }
} catch {
  failures.push("Missing generated _headers file")
}

for (const route of [
  "/",
  "/cli/",
  "/user-guide/",
  "/plugins/",
  "/zh-cn/",
  "/zh-cn/cli/",
  "/zh-cn/user-guide/",
  "/zh-cn/plugins/",
]) {
  const source = await readFile(outputForRoute(route), "utf8")
  const renderBlockingStylesheets = [
    ...source.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/gu),
  ].filter(
    ([link]) =>
      !/\bmedia="print"/u.test(link) &&
      !/\bhref="\/_astro\/ec\.[a-zA-Z0-9_-]+\.css"/u.test(link)
  )
  if (renderBlockingStylesheets.length > 0) {
    failures.push(`${route} has render-blocking stylesheets`)
  }
}

for (const sourceFile of htmlFiles) {
  const source = await readFile(sourceFile, "utf8")
  const markdownLink = source.match(
    /<link\b[^>]*type="text\/markdown"[^>]*href="([^"]+)"/u
  )?.[1]
  if (markdownLink) {
    const pathname = new URL(markdownLink).pathname
    try {
      const markdown = await readFile(
        path.join(outputRoot, pathname.slice(1)),
        "utf8"
      )
      if (
        !markdown.startsWith("---\ntitle: ") ||
        !markdown.includes("\nsource: ")
      ) {
        failures.push(`Missing Markdown source metadata: ${pathname}`)
      }
      markdownPages++
    } catch {
      failures.push(`Missing Markdown alternate: ${pathname}`)
    }
  }
  // Topic indices are internal plugin labels, never public navigation titles.
  for (const [, summary] of source.matchAll(
    /<summary\b[^>]*>([\s\S]*?)<\/summary>/gu
  )) {
    const label = summary.replace(/<[^>]*>/gu, "").trim()
    if (/^\d+$/u.test(label)) {
      failures.push(
        `${path.relative(outputRoot, sourceFile)} exposes numeric navigation group: ${label}`
      )
    }
  }
  if (/<style\b[^>]*\bset:html=/u.test(source)) {
    failures.push(
      `${path.relative(outputRoot, sourceFile)} has inert inline styles`
    )
  }
  if (source.includes('class="expressive-code"')) {
    // Plain Markdown currently emits real inline styles, while MDX uses the
    // fingerprinted stylesheet. Accept either, but never inert attributes.
    const inlineCodeStyles = [
      ...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gu),
    ].some(([, css]) => css.includes(".expressive-code{"))
    const stylesheet = source.match(
      /\bhref="(\/_astro\/ec\.[a-zA-Z0-9_-]+\.css)"/u
    )?.[1]
    if (!stylesheet && !inlineCodeStyles) {
      failures.push(
        `${path.relative(outputRoot, sourceFile)} is missing code block CSS`
      )
    } else if (stylesheet) {
      try {
        const css = await readFile(
          path.join(outputRoot, stylesheet.slice(1)),
          "utf8"
        )
        if (!css.includes(".expressive-code"))
          throw new Error("Missing code block styles")
      } catch {
        failures.push(
          `${path.relative(outputRoot, sourceFile)} has unavailable code block CSS: ${stylesheet}`
        )
      }
    }
  }
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
  "/user-guide/publishing/",
  "/user-guide/sync/",
  "/zh-cn/user-guide/publishing/",
  "/zh-cn/user-guide/sync/",
  "/specifications/file-format-1-0/",
  "/specifications/runtime-1-0/",
  "/specifications/system-metadata-merge-1-0/",
  "/specifications/adapter-1-0/",
  "/specifications/ui-1-0/",
  "/specifications/standard-views-1-0/",
  "/zh-cn/specifications/file-format-1-0/",
  "/zh-cn/specifications/runtime-1-0/",
  "/zh-cn/specifications/system-metadata-merge-1-0/",
  "/zh-cn/specifications/adapter-1-0/",
  "/zh-cn/specifications/ui-1-0/",
  "/zh-cn/specifications/standard-views-1-0/",
]) {
  try {
    await access(outputForRoute(route))
  } catch {
    failures.push(`Missing generated specification route: ${route}`)
  }
}

const llms = await readFile(path.join(outputRoot, "llms.txt"), "utf8")
const indexedPages = [
  ...llms.matchAll(/\]\((https:\/\/docs\.eidos\.space\/[^)]+\.md)\)/gu),
]
for (const [, href] of indexedPages) {
  try {
    await access(path.join(outputRoot, new URL(href).pathname.slice(1)))
  } catch {
    failures.push(`llms.txt links to missing Markdown: ${href}`)
  }
}
if (indexedPages.length !== markdownPages || markdownPages === 0) {
  failures.push(
    `Markdown discovery mismatch: ${indexedPages.length} llms.txt links, ${markdownPages} HTML alternates`
  )
}
const cliMarkdown = await readFile(
  path.join(outputRoot, "getting-started/cli.md"),
  "utf8"
)
const standardViews = await readFile(
  path.join(outputRoot, "specifications/standard-views-1-0.md"),
  "utf8"
)
if (!standardViews.includes("compact\\|standard\\|comfortable")) {
  failures.push(
    "Standard Views Markdown must preserve all enum values in one table cell"
  )
}
for (const route of ["concepts.md", "user-guide/views-and-querying.md"]) {
  const markdown = await readFile(path.join(outputRoot, route), "utf8")
  if (markdown.includes("No matching records"))
    failures.push(`Hidden ViewLab empty state leaked: ${route}`)
}
if (
  !cliMarkdown.includes(
    "curl -fsSL https://download.eidos.space/cli/install.sh | sh"
  ) ||
  !cliMarkdown.includes("```bash\n")
) {
  failures.push(
    "CLI Markdown must preserve the rendered install command and code language"
  )
}

if (failures.length > 0) {
  console.error(`Documentation build check failed:\n- ${failures.join("\n- ")}`)
  process.exitCode = 1
} else {
  console.log(
    `Documentation build check passed (${htmlFiles.length} HTML files, ${markdownPages} Markdown pages, ${checkedFragments.size} fragments).`
  )
}
