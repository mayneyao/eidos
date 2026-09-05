import { useEffect, useState } from "react"
import documents from "virtual:markdown-documents"
import { useSiteLocale } from "./locale"

export default function DocsPage({ route }: { route: string }) {
  const [query, setQuery] = useState("")
  const { locale, t, href } = useSiteLocale()
  const localizedDocuments = documents.filter((item) => item.locale === locale)
  const document = localizedDocuments.find((item) => item.route === href(route))
  useEffect(() => {
    let id = window.location.hash.slice(1)
    try {
      id = decodeURIComponent(id)
    } catch {
      /* An invalid fragment must not break the page. */
    }
    if (id) window.document.getElementById(id)?.scrollIntoView()
  }, [route, locale])
  const search = query.trim().toLowerCase()
  const results = search
    ? localizedDocuments.flatMap((item) =>
        item.headings
          .filter((heading) =>
            `${item.title} ${heading.title}`.toLowerCase().includes(search)
          )
          .slice(0, 8)
          .map((heading) => ({
            href: `${item.route}#${heading.id}`,
            title: heading.title,
            group: item.title,
          }))
      )
    : []
  return (
    <div className="site-docs-layout">
      <aside className="site-docs-sidebar">
        <label htmlFor="docs-filter">{t("Find a topic", "搜索主题")}</label>
        <input
          id="docs-filter"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("Props, plugins, shortcuts…", "属性、插件、快捷键…")}
        />
        <nav
          aria-label={
            search
              ? t("Documentation search results", "文档搜索结果")
              : t("Documentation", "文档目录")
          }
        >
          {search ? (
            results.length ? (
              results.map((item) => (
                <a key={item.href} href={item.href}>
                  <span>{item.title}</span>
                  <small>{item.group}</small>
                </a>
              ))
            ) : (
              <p role="status">
                {t("No matching topics.", "没有找到匹配的主题。")}
              </p>
            )
          ) : (
            localizedDocuments.map((item) => (
              <a
                key={item.route}
                href={item.route}
                aria-current={href(route) === item.route ? "page" : undefined}
              >
                {item.title}
              </a>
            ))
          )}
        </nav>
      </aside>
      <main id="site-main" className="site-document" tabIndex={-1}>
        {document ? (
          <>
            <div className="site-document-meta">
              <span>
                {t("Documentation", "文档")} / {document.title}
              </span>
              <span>{t("0.1 · Pre-release", "0.1 · 预发布")}</span>
            </div>
            {locale === "zh" && (
              <p className="site-translation-note">
                {document.guide
                  ? "中文导读，非英文参考的逐条译本。"
                  : "中文说明供参考，行为约定以英文规范为准。"}{" "}
                <a href={route} lang="en">
                  查看英文原文 →
                </a>
              </p>
            )}
            {/* Produced at build time with raw HTML and unsafe protocols disabled. */}
            <article
              className="site-prose"
              dangerouslySetInnerHTML={{ __html: document.html }}
            />
          </>
        ) : (
          <>
            <h1>{t("Page not found", "页面不存在")}</h1>
            <p>
              {t("This documentation page does not exist.", "未找到这篇文档。")}
            </p>
            <a href={href("/docs")}>
              {t("Back to getting started", "返回快速开始")}
            </a>
          </>
        )}
      </main>
      <aside
        className="site-docs-toc"
        aria-label={t("On this page", "本页内容")}
      >
        <p>{t("On this page", "本页内容")}</p>
        {document?.headings
          .filter((heading) => heading.level === 2)
          .map((heading) => (
            <a key={heading.id} href={`#${heading.id}`}>
              {heading.title}
            </a>
          ))}
      </aside>
    </div>
  )
}
