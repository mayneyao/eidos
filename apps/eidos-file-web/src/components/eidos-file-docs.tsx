import { useEffect, useMemo, type MouseEvent } from "react"
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Database,
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
    kicker: "Eidos File guide",
    title: "Open it. Shape it. Build with it.",
    intro:
      "Three focused references for the file, its format, and the public packages.",
    documents: "Guide and reference",
    contents: "On this page",
    edition: "Document",
    notice: "Package examples target the published 0.1.0 release.",
  },
  zh: {
    back: "编辑工具",
    docs: "开放格式",
    graft: "版本管理",
    kicker: "Eidos File 指南",
    title: "打开、组织，并基于它构建。",
    intro: "三篇聚焦文档，分别解释文件、格式与公共 package。",
    documents: "指南与参考",
    contents: "本文目录",
    edition: "文档",
    notice: "Package 示例对应已公开发布的 0.1.0 版本。",
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
          <a
            aria-label={t("openSQLiteInspector")}
            href="https://sqlite.eidos.space/"
            rel="noreferrer"
            target="_blank"
            title={t("openSQLiteInspector")}
          >
            <Database size={13} aria-hidden="true" />
            <span>
              {t("navInspector")}{" "}
              <span className="site-nav-long-label">
                {t("navInspectorQualifier")}
              </span>
            </span>
            <ArrowUpRight size={12} aria-hidden="true" />
          </a>
          <a aria-label={labels.graft} href="https://graft.eidos.space/">
            <span className="site-nav-full-label">{labels.graft}</span>
            <span className="site-nav-compact-label" aria-hidden="true">
              {t("navGraftCompact")}
            </span>
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
