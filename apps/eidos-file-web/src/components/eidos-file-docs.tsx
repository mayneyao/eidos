import { useEffect, useMemo, type MouseEvent } from "react"
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  FileText,
  Moon,
  Sun,
} from "lucide-react"

import {
  EIDOS_FILE_DOCUMENTS,
  eidosFileDocumentBySlug,
} from "../docs/eidos-file-documents"
import { renderEidosFileMarkdown } from "../docs/markdown"
import { useI18n } from "../i18n"

interface EidosFileDocsProps {
  slug: string | null
  theme: "light" | "dark"
  onToggleTheme: () => void
}

const copy = {
  en: {
    back: "Editor",
    docs: "Open Format",
    graft: "Version Control",
    kicker: "Public Eidos File documentation",
    title: "Use Eidos File. Build on Eidos File.",
    intro:
      "Stable guides for people who use Eidos Files and developers who build compatible tools.",
    documents: "Guides and reference",
    contents: "On this page",
    edition: "Document",
    notice:
      "All examples target the public Eidos File v1 contract and the current published package boundaries.",
  },
  zh: {
    back: "编辑工具",
    docs: "开放格式",
    graft: "版本管理",
    kicker: "公开的 Eidos File 文档",
    title: "使用 Eidos File，基于 Eidos File 构建。",
    intro: "面向 Eidos File 文件使用者，以及构建兼容工具和自定义体验的开发者。",
    documents: "指南与参考",
    contents: "本文目录",
    edition: "文档",
    notice: "全部示例面向公开的 Eidos File v1 契约与当前可发布 package 边界。",
  },
} as const

export function EidosFileDocs({
  slug,
  theme,
  onToggleTheme,
}: EidosFileDocsProps) {
  const { locale, setLocale, t } = useI18n()
  const labels = copy[locale]
  const activeDocument = eidosFileDocumentBySlug(slug)
  const rendered = useMemo(
    () => renderEidosFileMarkdown(activeDocument.markdown[locale]),
    [activeDocument, locale]
  )

  useEffect(() => {
    document.title = `${activeDocument.title[locale]} · Eidos File`
    return () => {
      document.title = "Eidos File"
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
          <span>Eidos File</span>
        </a>
        <nav className="site-nav" aria-label="Eidos File">
          <a href="#/">{labels.back}</a>
          <a className="is-active" href="#/docs/overview">
            {labels.docs}
          </a>
          <a href="https://graft.eidos.space/">
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
            {EIDOS_FILE_DOCUMENTS.map((document, index) => (
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
              {labels.edition}
            </span>
            <code>{activeDocument.edition[locale]}</code>
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
