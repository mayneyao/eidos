import fs from "node:fs"
import path from "node:path"
import type { Plugin } from "vite"
import { renderDocument } from "./src/site/document-renderer"
import { localizedPath } from "./src/site/routes"

const documentEntries = [
  ["/docs", "Getting started", "README.md"],
  ["/docs/api", "API reference", "API.md"],
  ["/docs/guide", "Interactions", "docs/editor-guide.md"],
  ["/docs/plugins", "Writing a plugin", "docs/plugins.md"],
  ["/docs/specs", "Specifications", "specs/README.md"],
  ["/docs/specification", "Behavior specification", "SPEC.md"],
  ["/docs/presets", "Presets", "docs/presets.md"],
  ["/docs/architecture", "Architecture", "architecture/README.md"],
  ["/docs/roadmap", "Delivery roadmap", "architecture/DELIVERY.md"],
  ["/docs/composition", "Build your editor", "docs/composition.md"],
] as const

const chineseEntries = [
  ["快速开始", "getting-started", false],
  ["API 参考导读", "api", true],
  ["交互指南", "interactions", false],
  ["编写插件", "plugins", false],
  ["规范索引", "specs", false],
  ["行为规范导读", "specification", true],
  ["预设", "presets", false],
  ["实现架构", "architecture", false],
  ["交付路线", "roadmap", true],
  ["构建编辑器", "composition", false],
] as const

const allEntries = documentEntries.flatMap(([route, title, file], index) => [
  { route, title, file, locale: "en" as const, guide: false },
  {
    route: localizedPath(route, "zh"),
    title: chineseEntries[index][0],
    file: `docs/zh/${chineseEntries[index][1]}.md`,
    locale: "zh" as const,
    guide: chineseEntries[index][2],
  },
])

export function siteDocuments(packageRoot: string): Plugin {
  const moduleId = "virtual:markdown-documents"
  const resolvedId = `\0${moduleId}`
  return {
    name: "markdown-public-documents",
    resolveId(id) {
      if (id === moduleId) return resolvedId
    },
    load(id) {
      if (id !== resolvedId) return
      const documents = allEntries.map(
        ({ route, title, file, locale, guide }) => {
          const absoluteFile = path.join(packageRoot, file)
          this.addWatchFile(absoluteFile)
          const rendered = renderDocument(fs.readFileSync(absoluteFile, "utf8"))
          const html = rendered.html.replace(
            /href="([^"]*)"/gu,
            (match: string, destination: string) => {
              if (/^(?:[a-z]+:|#|\/)/iu.test(destination)) return match
              const [pathname, hash] = destination.split("#")
              const resolved = path.resolve(
                path.dirname(absoluteFile),
                pathname
              )
              const target = allEntries.find(
                (entry) => path.join(packageRoot, entry.file) === resolved
              )
              if (target)
                return `href="${target.route}${hash ? `#${hash}` : ""}"`
              const repoRelative = path.relative(
                path.resolve(packageRoot, "../.."),
                resolved
              )
              if (repoRelative.startsWith("..")) return match
              return `href="https://github.com/mayneyao/eidos/blob/main/${repoRelative}${hash ? `#${hash}` : ""}"`
            }
          )
          return { route, title, locale, guide, ...rendered, html }
        }
      )
      return `export default ${JSON.stringify(documents)}`
    },
    handleHotUpdate({ file, server }) {
      if (
        allEntries.some((entry) => path.join(packageRoot, entry.file) === file)
      ) {
        const module = server.moduleGraph.getModuleById(resolvedId)
        if (module) server.moduleGraph.invalidateModule(module)
        server.ws.send({ type: "full-reload" })
      }
    },
  }
}
