import { Brand } from "./brand"
import { LanguageSwitch, useSiteLocale } from "./locale"

export function SiteHeader({
  theme,
  onToggleTheme,
}: {
  theme: "light" | "dark"
  onToggleTheme(): void
}) {
  const { route, t, href } = useSiteLocale()
  return (
    <>
      <a className="site-skip" href="#site-main">
        {t("Skip to content", "跳至正文")}
      </a>
      <header className="site-header">
        <Brand />
        <nav aria-label={t("Main navigation", "主导航")}>
          {[
            ["/docs", t("Docs", "文档")],
            ["/spec", t("Syntax", "语法示例")],
            ["/playground", t("Playground", "交互体验")],
            ["/build", t("Build your editor", "构建编辑器")],
          ].map(([path, label]) => (
            <a
              key={path}
              href={href(path)}
              aria-current={route.startsWith(path) ? "page" : undefined}
            >
              {label}
            </a>
          ))}
          <a href="https://github.com/mayneyao/eidos/tree/main/packages/markdown">
            GitHub ↗
          </a>
          <button
            type="button"
            className="site-theme-toggle"
            onClick={onToggleTheme}
            aria-label={t(
              `Switch to ${theme === "light" ? "dark" : "light"} theme`,
              `切换到${theme === "light" ? "深色" : "浅色"}主题`
            )}
          >
            {theme === "light" ? t("Dark", "深色") : t("Light", "浅色")}
          </button>
          <LanguageSwitch />
        </nav>
      </header>
    </>
  )
}
