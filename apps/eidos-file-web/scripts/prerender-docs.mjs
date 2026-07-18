import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const directory = path.dirname(fileURLToPath(import.meta.url))
const projectDirectory = path.resolve(directory, "..")
const distDirectory = path.join(projectDirectory, "dist")
const siteOrigin = "https://editor.eidos.space"
const entryUrl = pathToFileURL(
  path.join(
    projectDirectory,
    "node_modules/.cache/eidos-file-docs-ssr/prerender.mjs"
  )
)
const { renderDocsPage } = await import(entryUrl.href)
const template = await readFile(path.join(distDirectory, "index.html"), "utf8")

const documents = ["overview", "format", "build"]
const locales = ["en", "zh"]

function docsPath(slug, locale) {
  const prefix = locale === "zh" ? "/zh" : ""
  return slug === "overview" ? `${prefix}/docs/` : `${prefix}/docs/${slug}/`
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function renderDocument(page, locale) {
  const pathname = docsPath(page.slug, locale)
  const englishPath = docsPath(page.slug, "en")
  const chinesePath = docsPath(page.slug, "zh")
  const canonicalUrl = `${siteOrigin}${pathname}`
  const language = locale === "zh" ? "zh-CN" : "en"
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: page.title.replace(/ · Eidos File$/, ""),
    description: page.description,
    inLanguage: language,
    mainEntityOfPage: canonicalUrl,
    isPartOf: {
      "@type": "WebSite",
      name: "Eidos File",
      url: siteOrigin,
    },
  }).replaceAll("<", "\\u003c")
  const metadata = [
    '<meta name="robots" content="index, follow" />',
    `<link rel="canonical" href="${canonicalUrl}" />`,
    `<link rel="alternate" hreflang="en" href="${siteOrigin}${englishPath}" />`,
    `<link rel="alternate" hreflang="zh-CN" href="${siteOrigin}${chinesePath}" />`,
    `<link rel="alternate" hreflang="x-default" href="${siteOrigin}${englishPath}" />`,
    '<meta property="og:type" content="article" />',
    '<meta property="og:site_name" content="Eidos File" />',
    `<meta property="og:locale" content="${locale === "zh" ? "zh_CN" : "en_US"}" />`,
    `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
    `<meta property="og:url" content="${canonicalUrl}" />`,
    '<meta name="twitter:card" content="summary" />',
    `<script type="application/ld+json">${structuredData}</script>`,
  ].join("\n    ")

  return template
    .replace('<html lang="en">', `<html lang="${language}">`)
    .replace(/(<link rel="manifest"[^>]*>)/, "$1\n")
    .replace(
      /<title>[^<]*<\/title>/,
      `<title>${escapeHtml(page.title)}</title>`
    )
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
      `<meta name="description" content="${escapeHtml(page.description)}" />`
    )
    .replace("</head>", `    ${metadata}\n  </head>`)
    .replace(
      '<div id="root"></div>',
      `<div id="root" data-prerendered="docs">${page.html}</div>`
    )
}

const sitemapPaths = ["/docs/"]

for (const locale of locales) {
  for (const slug of documents) {
    const page = renderDocsPage(slug, locale)
    const pathname = docsPath(page.slug, locale)
    const outputDirectory = path.join(distDirectory, pathname)
    await mkdir(outputDirectory, { recursive: true })
    await writeFile(
      path.join(outputDirectory, "index.html"),
      renderDocument(page, locale)
    )
    if (!sitemapPaths.includes(pathname)) sitemapPaths.push(pathname)
  }
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapPaths
  .map((pathname) => `  <url><loc>${siteOrigin}${pathname}</loc></url>`)
  .join("\n")}
</urlset>
`

await writeFile(path.join(distDirectory, "sitemap.xml"), sitemap)
await writeFile(
  path.join(distDirectory, "robots.txt"),
  `User-agent: *\nAllow: /\n\nSitemap: ${siteOrigin}/sitemap.xml\n`
)
