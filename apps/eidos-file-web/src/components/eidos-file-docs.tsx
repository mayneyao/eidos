import { Fragment, useEffect, useMemo, useRef, type MouseEvent } from "react"
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
import { eidosFileDocsPath } from "../docs/routes"
import { useI18n } from "../i18n"
import { EidosFileLanguageSelect } from "./eidos-file-language-select"
import { ReadonlyEidosFileDocTable } from "./readonly-eidos-file-doc-table"

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
    notice: "Package examples target the published 1.0.0 release.",
    theme: "Toggle color theme",
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
    notice: "Package 示例对应已公开发布的 1.0.0 版本。",
    theme: "切换颜色主题",
  },
} as const

const FIELD_CAPABILITY_EMBED =
  /<div data-eidos-file-embed="field-capabilities"><\/div>/g

export function EidosFileDocs({
  slug,
  theme,
  onToggleTheme,
}: EidosFileDocsProps) {
  const { locale, t } = useI18n()
  const labels = copy[locale]
  const activeDocument = eidosFileDocumentBySlug(slug)
  const articleRef = useRef<HTMLElement | null>(null)
  const rendered = useMemo(
    () => renderEidosFileMarkdown(activeDocument.markdown[locale], locale),
    [activeDocument, locale]
  )
  const markdownSegments = useMemo(
    () => rendered.html.split(FIELD_CAPABILITY_EMBED),
    [rendered.html]
  )

  useEffect(() => {
    document.title = `${activeDocument.title[locale]} · Eidos File`
    return () => {
      document.title = "Eidos File"
    }
  }, [activeDocument, locale])

  const scrollToHeading = (id: string) => {
    const heading = document.getElementById(id)
    const article = articleRef.current
    if (!heading || !article) return

    const articleStyle = window.getComputedStyle(article)
    const articleScrolls =
      /(auto|scroll)/.test(articleStyle.overflowY) &&
      article.scrollHeight > article.clientHeight
    const shell = article.closest<HTMLElement>(".docs-shell")
    const scrollContainer = articleScrolls ? article : shell
    if (!scrollContainer) return

    const containerTop = scrollContainer.getBoundingClientRect().top
    const headingTop = heading.getBoundingClientRect().top
    const scrollMargin =
      Number.parseFloat(window.getComputedStyle(heading).scrollMarginTop) || 0
    const stickyHeaderHeight =
      scrollContainer === shell
        ? (shell.querySelector<HTMLElement>(".docs-header")?.offsetHeight ?? 0)
        : 0

    scrollContainer.scrollTo({
      top: Math.max(
        0,
        scrollContainer.scrollTop +
          headingTop -
          containerTop -
          stickyHeaderHeight -
          scrollMargin
      ),
      behavior: "smooth",
    })
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
        <a className="brand-lockup" href="/" aria-label={labels.back}>
          <span className="brand-mark" aria-hidden="true">
            E
          </span>
          <span>Eidos File</span>
        </a>
        <nav className="site-nav" aria-label="Eidos File">
          <a href="/">{labels.back}</a>
          <a className="is-active" href={eidosFileDocsPath("overview", locale)}>
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
          <EidosFileLanguageSelect
            onChange={(nextLocale) =>
              window.location.assign(
                eidosFileDocsPath(activeDocument.slug, nextLocale)
              )
            }
          />
          <button
            className="icon-button"
            type="button"
            aria-label={labels.theme}
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
                href={eidosFileDocsPath(document.slug, locale)}
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

        <article ref={articleRef} className="docs-article" id="docs-article">
          <div className="docs-article-meta">
            <span>
              <FileText size={14} aria-hidden="true" />
              {labels.edition}
            </span>
            <code>{activeDocument.edition[locale]}</code>
          </div>
          <div className="markdown-body" onClick={handleMarkdownClick}>
            {markdownSegments.map((html, index) => (
              <Fragment key={`${activeDocument.slug}-${locale}-${index}`}>
                <div
                  className="markdown-body-segment"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
                {index < markdownSegments.length - 1 ? (
                  <ReadonlyEidosFileDocTable theme={theme} />
                ) : null}
              </Fragment>
            ))}
          </div>
          <a className="docs-back-link" href="/">
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
