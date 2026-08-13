import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const docsApp = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const repository = path.resolve(docsApp, "../..")
const sourceDirectory = path.join(repository, "docs/specs")
const contentDirectory = path.join(docsApp, "src/content/docs")

const specifications = [
  { source: "eidos-file-1.0.md", slug: "file-format-1-0", order: 10 },
  { source: "eidos-runtime-1.0.md", slug: "runtime-1-0", order: 20 },
  {
    source: "eidos-system-metadata-merge-1.0.md",
    slug: "system-metadata-merge-1-0",
    order: 25,
  },
  { source: "eidos-adapter-1.0.md", slug: "adapter-1-0", order: 30 },
  { source: "eidos-ui-1.0.md", slug: "ui-1-0", order: 40 },
]

const retiredGeneratedSlugs = [
  "file-format-1.0",
  "runtime-1.0",
  "system-metadata-merge-1.0",
  "adapter-1.0",
  "ui-1.0",
]

function escapeFrontmatter(value) {
  return JSON.stringify(value)
}

function routeForSource(source) {
  if (source === "README.md") return "/specifications/"
  if (source === "README.zh.md") return "/zh-cn/specifications/"
  if (source === "eidos-file-developer-guide.zh.md") {
    return "/zh-cn/developers/runtime-quickstart/"
  }
  const chinese = source.endsWith(".zh.md")
  const name = source.replace(/\.zh\.md$|\.md$/u, "")
  const spec = specifications.find((entry) => entry.source === `${name}.md`)
  if (!spec) return null
  return `${chinese ? "/zh-cn" : ""}/specifications/${spec.slug}/`
}

function rewriteLinks(markdown) {
  return markdown.replace(
    /\]\(([^)\s]+)(\s+(?:"[^"]*"|'[^']*'))?\)/gu,
    (match, target, title = "") => {
      const [pathname, fragment = ""] = target.split("#", 2)
      if (pathname.startsWith("./") && pathname.endsWith(".md")) {
        const route = routeForSource(pathname.slice(2))
        if (route) return `](${route}${fragment ? `#${fragment}` : ""}${title})`
      }
      if (pathname.startsWith("../../")) {
        const repositoryPath = path.posix.normalize(
          path.posix.join("docs/specs", pathname)
        )
        return `](https://github.com/mayneyao/eidos/blob/dev/${repositoryPath}${
          fragment ? `#${fragment}` : ""
        }${title})`
      }
      return match
    }
  )
}

function generatedPage(source, language, order) {
  const lines = source.replace(/\r\n/gu, "\n").split("\n")
  const titleLine = lines.findIndex((line) => line.startsWith("# "))
  if (titleLine === -1) throw new Error("Specification is missing an H1 title")
  const title = lines[titleLine].slice(2).trim()
  lines.splice(titleLine, 1)
  const chinese = language === "zh-cn"
  const description = chinese
    ? `${title} 的说明性中文参考。英文规范文本拥有最终解释权。`
    : `Canonical ${title} specification.`
  const sourceNotice = chinese
    ? "> **来源说明：** 本页由仓库中的说明性中文译本生成。发生冲突时，以英文规范为准。"
    : "> **Source status:** This page is generated from the canonical English specification in the Eidos repository."
  return [
    "---",
    `title: ${escapeFrontmatter(title)}`,
    `description: ${escapeFrontmatter(description)}`,
    "sidebar:",
    `  order: ${order}`,
    "---",
    "",
    sourceNotice,
    "",
    rewriteLinks(lines.join("\n").trimStart()).replaceAll("```ebnf", "```text"),
    "",
  ].join("\n")
}

for (const directory of [
  path.join(contentDirectory, "specifications"),
  path.join(contentDirectory, "zh-cn/specifications"),
]) {
  for (const slug of retiredGeneratedSlugs) {
    await rm(path.join(directory, `${slug}.md`), { force: true })
  }
}

for (const specification of specifications) {
  const englishSource = await readFile(
    path.join(sourceDirectory, specification.source),
    "utf8"
  )
  const chineseSourceName = specification.source.replace(/\.md$/u, ".zh.md")
  const chineseSource = await readFile(
    path.join(sourceDirectory, chineseSourceName),
    "utf8"
  )
  const outputs = [
    {
      directory: path.join(contentDirectory, "specifications"),
      language: "en",
      source: englishSource,
    },
    {
      directory: path.join(contentDirectory, "zh-cn/specifications"),
      language: "zh-cn",
      source: chineseSource,
    },
  ]
  for (const output of outputs) {
    await mkdir(output.directory, { recursive: true })
    await writeFile(
      path.join(output.directory, `${specification.slug}.md`),
      generatedPage(output.source, output.language, specification.order),
      "utf8"
    )
  }
}

console.log(`Synced ${specifications.length * 2} specification pages.`)
