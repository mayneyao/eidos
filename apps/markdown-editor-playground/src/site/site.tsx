import { lazy, Suspense, useEffect, useState } from "react"
import "./site.css"
import { SiteHeader } from "./header"
import { useSiteLocale } from "./locale"
import { presets } from "./presets"

const LiveExample = lazy(() => import("./live-example"))
const SyntaxLab = lazy(() => import("./syntax-lab"))
const Builder = lazy(() => import("./builder/builder"))
const DocsPage = lazy(() => import("./docs-page"))
const Playground = lazy(() =>
  import("../app").then((module) => ({ default: module.App }))
)

function initialTheme(): "light" | "dark" {
  try {
    const stored = localStorage.getItem("markdown-site-theme")
    if (stored === "dark" || stored === "light") return stored
  } catch {
    /* Storage may be disabled. */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

export function Site() {
  const [theme, setTheme] = useState(initialTheme)
  const { route, locale, t, href } = useSiteLocale()
  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"))
  }
  useEffect(() => {
    try {
      localStorage.setItem("markdown-site-theme", theme)
    } catch {
      /* Optional preference. */
    }
  }, [theme])
  useEffect(() => {
    document.title =
      route === "/"
        ? t(
            "Markdown — a composable React editor",
            "Markdown — 可组合的 React 编辑器"
          )
        : route === "/playground"
          ? t("Playground — Markdown", "交互体验 — Markdown")
          : route === "/build"
            ? t("Build your editor — Markdown", "构建编辑器 — Markdown")
            : route === "/spec"
              ? t("Syntax — Markdown", "语法示例 — Markdown")
              : t("Documentation — Markdown", "开发文档 — Markdown")
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        t(
          "A composable React Markdown editor. Explore the API, try live examples, and build your own syntax plugins.",
          "可组合的 React Markdown 编辑器。阅读 API 文档、体验交互示例，构建自己的 Markdown 语法插件。"
        )
      )
  }, [route, locale])
  return (
    <div
      className={`site-frame${route === "/playground" ? " site-playground" : ""}`}
      data-theme={theme}
      data-locale={locale}
    >
      <SiteHeader theme={theme} onToggleTheme={toggleTheme} />
      {route === "/playground" ? (
        <Suspense
          fallback={
            <p className="site-loading">
              {t("Loading the playground…", "正在加载交互体验…")}
            </p>
          }
        >
          <Playground theme={theme} />
        </Suspense>
      ) : (
        <>
          {route === "/" ? (
            <main id="site-main" className="site-home" tabIndex={-1}>
              <section className="site-intro">
                <p className="site-eyebrow">
                  @eidos.space/markdown{" "}
                  <span>{t("React · Pre-release", "React · 预发布")}</span>
                </p>
                <h1>
                  {t("A writing surface.", "自在书写。")}
                  <br />
                  {t("A Markdown document.", "始终是 Markdown。")}
                </h1>
                <div className="site-intro-bottom">
                  <p>
                    {t(
                      "A composable editor for the things people write.",
                      "为文字而生的可组合编辑器。"
                    )}
                    <br className="site-desktop-break" />
                    {t(
                      " Familiar block interactions. Plain-text ownership.",
                      "熟悉的块级交互，属于你的纯文本。"
                    )}
                  </p>
                  <a className="site-primary-link" href={href("/docs")}>
                    {t("Explore the component", "了解组件")}{" "}
                    <span aria-hidden="true">→</span>
                  </a>
                </div>
              </section>
              <section
                className="site-preset-overview"
                aria-label={t("Choose a preset", "选择预设")}
              >
                <p className="site-eyebrow">
                  {t(
                    "ONE COMPONENT / COMPOSABLE PRESETS",
                    "同一个组件 / 可组合预设"
                  )}
                </p>
                {presets.map((preset) => (
                  <a
                    key={preset.id}
                    href={`${href("/playground")}?preset=${preset.id}`}
                  >
                    <strong>{preset.name}</strong>
                    <span>{preset[locale]}</span>
                    <span aria-hidden="true">↗</span>
                  </a>
                ))}
              </section>
              <Suspense
                fallback={
                  <div className="site-example site-loading">
                    {t(
                      "Loading the interactive editor…",
                      "正在加载编辑器示例…"
                    )}
                  </div>
                }
              >
                <LiveExample theme={theme} />
              </Suspense>
              <section
                className="site-principles"
                aria-label={t("Component principles", "组件设计原则")}
              >
                <div>
                  <p className="site-eyebrow">
                    {t("01 / THE DOCUMENT", "01 / 文档")}
                  </p>
                  <h2>
                    {t("Your source.", "你的源文件。")}
                    <br />
                    {t("Your application.", "你的应用。")}
                  </h2>
                  <p>
                    {t(
                      "Keep Markdown in a file, a database, or an in-memory draft. Storage and navigation belong to your host—not the editor.",
                      "Markdown 可以保存在文件、数据库或内存草稿里。存储与导航由你的应用决定，编辑器不接管。"
                    )}
                  </p>
                  <a href={href("/docs/api")}>
                    {t("Integrate the editor →", "接入编辑器 →")}
                  </a>
                </div>
                <div>
                  <p className="site-eyebrow">
                    {t("02 / THE EXTENSION POINT", "02 / 扩展")}
                  </p>
                  <h2>
                    {t("Compose features.", "组合功能。")}
                    <br />
                    {t("Keep one editor.", "共用一个编辑器。")}
                  </h2>
                  <p>
                    {t(
                      "Bring syntax, nodes and behaviors together in a plugin. Choose GFM, Eidos or Obsidian as a preset, or assemble the features your product needs.",
                      "把语法、节点与行为放进同一个插件。选用 GFM、Eidos 或 Obsidian 预设，或组合产品所需的功能。"
                    )}
                  </p>
                  <a href={href("/docs/presets")}>
                    {t("Explore presets →", "了解预设 →")}
                  </a>
                </div>
              </section>
              <section className="site-status-note">
                <h2>
                  {t(
                    "Built in the open. Still taking shape.",
                    "开放构建，持续打磨。"
                  )}
                </h2>
                <p>
                  {t(
                    "The current release is used by Eidos and is being prepared for independent use. APIs are pre-release; source-preservation and dialect limits are documented, not hidden.",
                    "组件已用于 Eidos，正在完善独立使用的能力。API 尚处于预发布阶段；源码保留与语法兼容的边界会如实写进文档。"
                  )}
                </p>
                <a href={href("/docs/roadmap")}>
                  {t("Read the delivery roadmap →", "查看交付路线 →")}
                </a>
              </section>
            </main>
          ) : (
            <Suspense
              fallback={
                <p className="site-loading">
                  {t("Loading documentation…", "正在加载文档…")}
                </p>
              }
            >
              {route === "/build" ? (
                <Builder theme={theme} />
              ) : route === "/spec" ? (
                <SyntaxLab theme={theme} />
              ) : (
                <DocsPage
                  route={
                    route === "/docs/compatibility" ? "/docs/presets" : route
                  }
                />
              )}
            </Suspense>
          )}
          <footer className="site-footer">
            <span>Markdown by Eidos</span>
            <a href={href("/docs/specification")}>
              {t("Behavior contract", "行为约定")}
            </a>
            <a href={href("/docs/presets")}>{t("Presets", "预设")}</a>
          </footer>
        </>
      )}
    </div>
  )
}
