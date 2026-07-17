import { useEffect, useMemo, type MouseEvent } from "react"
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  FileText,
  Moon,
  Sun,
} from "lucide-react"

import { BASE_DOCUMENTS, baseDocumentBySlug } from "../docs/base-documents"
import { renderBaseMarkdown } from "../docs/markdown"
import { useI18n } from "../i18n"

interface BaseDocsProps {
  slug: string | null
  theme: "light" | "dark"
  onToggleTheme: () => void
}

const copy = {
  en: {
    back: "Base editor",
    docs: "Documentation",
    graft: "Graft Playground",
    kicker: "Open implementation RFCs",
    title: "Build with Base.",
    intro:
      "The file format, runtime, product behavior, and extension boundaries—published from the same repository as the editor.",
    documents: "Base documents",
    contents: "On this page",
    source: "Source document",
    notice:
      "These are living RFCs. Accepted behavior is backed by the current implementation; draft sections describe intended direction and may change.",
  },
  zh: {
    back: "Base 编辑器",
    docs: "文档",
    graft: "Graft Playground",
    kicker: "开放的实现 RFC",
    title: "基于 Base 构建。",
    intro:
      "文件格式、运行时、产品行为与扩展边界，直接公开自编辑器所在的同一代码仓库。",
    documents: "Base 文档",
    contents: "本文目录",
    source: "源文档",
    notice:
      "这些是持续演进的 RFC。已验收行为由当前实现支撑；草案章节描述目标方向，仍可能调整。",
  },
} as const

export function BaseDocs({ slug, theme, onToggleTheme }: BaseDocsProps) {
  const { locale, setLocale, t } = useI18n()
  const labels = copy[locale]
  const activeDocument = baseDocumentBySlug(slug)
  const rendered = useMemo(
    () => renderBaseMarkdown(activeDocument.markdown[locale]),
    [activeDocument, locale]
  )

  useEffect(() => {
    document.title = `${activeDocument.title[locale]} · Eidos Base`
    return () => {
      document.title = "Eidos Base"
    }
  }, [activeDocument, locale])

  const scrollToHeading = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })
  }

  const handleMarkdownClick = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest("a")
    const href = anchor?.getAttribute("href")
    if (!href?.startsWith("#") || href.startsWith("#/")) return
    event.preventDefault()
    scrollToHeading(href.slice(1))
  }

  return (
    <main className="docs-shell" id="main-content">
      <a className="skip-link" href="#docs-article">
        {labels.contents}
      </a>
      <header className="launch-header docs-header">
        <a className="brand-lockup" href="#/" aria-label={labels.back}>
          <span className="brand-mark" aria-hidden="true">
            E
          </span>
          <span>Eidos Base</span>
        </a>
        <nav className="site-nav" aria-label="Base">
          <a href="#/">{labels.back}</a>
          <a className="is-active" href="#/docs/format-runtime">
            {labels.docs}
          </a>
          <a href="https://graft.eidos.space">
            {labels.graft}
            <ArrowUpRight size={12} aria-hidden="true" />
          </a>
        </nav>
        <div className="launch-header-actions">
          <button
            className="language-button"
            type="button"
            aria-label={t("languageAction")}
            onClick={() => setLocale(locale === "en" ? "zh" : "en")}
          >
            {locale === "en" ? "中文" : "EN"}
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`}
            onClick={onToggleTheme}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      <div className="docs-layout">
        <aside className="docs-sidebar" aria-label={labels.documents}>
          <div className="docs-sidebar-intro">
            <BookOpen size={17} aria-hidden="true" />
            <p>{labels.kicker}</p>
            <h2>{labels.title}</h2>
            <span>{labels.intro}</span>
          </div>
          <nav className="docs-list">
            {BASE_DOCUMENTS.map((document, index) => (
              <a
                className={
                  document.slug === activeDocument.slug ? "is-active" : ""
                }
                href={`#/docs/${document.slug}`}
                key={document.slug}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{document.title[locale]}</strong>
                  <small>{document.summary[locale]}</small>
                </div>
              </a>
            ))}
          </nav>
          <p className="docs-notice">{labels.notice}</p>
        </aside>

        <article className="docs-article" id="docs-article">
          <div className="docs-article-meta">
            <span>
              <FileText size={14} aria-hidden="true" />
              {labels.source}
            </span>
            <code>{activeDocument.sourcePath}</code>
          </div>
          <div
            className="markdown-body"
            dangerouslySetInnerHTML={{ __html: rendered.html }}
            onClick={handleMarkdownClick}
          />
          <a className="docs-back-link" href="#/">
            <ArrowLeft size={14} aria-hidden="true" />
            {labels.back}
          </a>
        </article>

        <aside className="docs-toc" aria-label={labels.contents}>
          <strong>{labels.contents}</strong>
          <nav>
            {rendered.headings
              .filter((heading) => heading.level === 2)
              .slice(0, 18)
              .map((heading) => (
                <button
                  type="button"
                  key={heading.id}
                  onClick={() => scrollToHeading(heading.id)}
                >
                  {heading.text}
                </button>
              ))}
          </nav>
        </aside>
      </div>
    </main>
  )
}
