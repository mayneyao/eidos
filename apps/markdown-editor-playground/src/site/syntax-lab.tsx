import { useEffect, useState } from "react"
import { MarkdownEditor } from "@eidos.space/markdown"
import "@eidos.space/markdown/styles.css"
import { commonmarkPreset } from "@eidos.space/markdown/presets"
import { useSiteLocale } from "./locale"
import { chineseEditorLabels } from "./editor-labels"
import { presets } from "./presets"
import { syntaxExamples } from "./syntax-catalog"
import { syntaxLessons } from "./syntax-lessons"

const columns = [{ id: "commonmark", name: "CommonMark" }, ...presets] as const
type ColumnId = (typeof columns)[number]["id"]
const readPreset = (): ColumnId =>
  columns.find(
    (entry) =>
      entry.id === new URLSearchParams(window.location.search).get("preset")
  )?.id ??
  columns.find((column) => {
    const example = syntaxExamples.find(
      (entry) => entry.id === window.location.hash.slice(1)
    )
    return example && supports(example, column.id)
  })?.id ??
  "gfm"
const supports = (entry: (typeof syntaxExamples)[number], id: ColumnId) =>
  id === "commonmark"
    ? entry.group === "CommonMark"
    : entry.presets.includes(id)

export default function SyntaxLab({ theme }: { theme: "light" | "dark" }) {
  const { locale, t, href } = useSiteLocale()
  const [preset, setPreset] = useState<ColumnId>(readPreset)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(
    () =>
      syntaxExamples.find(
        (entry) => entry.id === window.location.hash.slice(1)
      ) ?? syntaxExamples[0]
  )
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  useEffect(() => {
    const syncLocation = () => {
      const example = syntaxExamples.find(
        (entry) => entry.id === window.location.hash.slice(1)
      )
      if (example) setSelected(example)
      setPreset(readPreset())
    }
    window.addEventListener("hashchange", syncLocation)
    window.addEventListener("popstate", syncLocation)
    return () => {
      window.removeEventListener("hashchange", syncLocation)
      window.removeEventListener("popstate", syncLocation)
    }
  }, [])
  const source = drafts[selected.id] ?? selected.source
  const supported = supports(selected, preset)
  const choose = (
    entry: typeof selected,
    next: ColumnId = supports(entry, preset)
      ? preset
      : (columns.find((column) => supports(entry, column.id))?.id ?? preset)
  ) => {
    setSelected(entry)
    setPreset(next)
    const url = new URL(window.location.href)
    url.hash = entry.id
    url.searchParams.set("preset", next)
    window.history.replaceState(window.history.state, "", url)
  }
  const filtered = syntaxExamples.filter((entry) =>
    `${entry.en} ${entry.zh} ${entry.group} ${entry.presets.join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase())
  )
  const modes = {
    rich: t("Direct editing", "直接编辑"),
    semantic: t("Visual rendering · source editing", "可视化呈现 · 源码编辑"),
    safe: t("Sanitized preview / inert source", "安全预览 / 惰性源码"),
    host: t("Host resolution required", "需要宿主解析"),
  }
  return (
    <main id="site-main" className="site-syntax-lab" tabIndex={-1}>
      <div className="site-lab-heading">
        <p className="site-eyebrow">MARKDOWN / SYNTAX</p>
        <h1>
          {t(
            "Start with Markdown. Extend what you need.",
            "从基础语法开始，按需扩展。"
          )}
        </h1>
        <p>
          {t(
            "Start with CommonMark and GFM, then add plugins for your application. These examples demonstrate shipped features and their editing boundaries—not a catalog of every Markdown dialect.",
            "以 CommonMark 和 GFM 为基础，通过插件添加应用需要的能力。这里展示已实现的语法与编辑边界，不收集所有 Markdown 方言。"
          )}
        </p>
        <div className="site-lab-controls">
          <a href={href("/build")}>
            {t("Build your editor →", "构建你的编辑器 →")}
          </a>
          <a href={href("/docs/plugins")}>
            {t("Write a plugin →", "编写插件 →")}
          </a>
          <a
            href="https://spec.commonmark.org/0.31.2/"
            target="_blank"
            rel="noreferrer"
          >
            CommonMark ↗
          </a>
          <a
            href="https://github.github.com/gfm/"
            target="_blank"
            rel="noreferrer"
          >
            GFM ↗
          </a>
        </div>
      </div>
      <div className="site-lab-layout">
        <aside className="site-syntax-index">
          <label>
            {t("Find syntax", "查找语法")}
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Table, equation, link…", "表格、公式、链接…")}
            />
          </label>
          <p className="site-lab-note">
            {syntaxExamples.length}{" "}
            {t("topics · choose one to learn", "个主题 · 选择语法开始学习")}
          </p>
          <nav
            className="site-syntax-list"
            aria-label={t("Syntax topics", "语法主题")}
          >
            {(["CommonMark", "GFM", "Extended", "Vault"] as const).map(
              (group) => {
                const entries = filtered.filter(
                  (entry) => entry.group === group
                )
                if (!entries.length) return null
                const names = {
                  CommonMark: t(
                    "CommonMark · Foundation",
                    "CommonMark · 基础语法"
                  ),
                  GFM: t("GFM · Extensions", "GFM · 标准扩展"),
                  Extended: t(
                    "Optional plugins · Rich content",
                    "可选插件 · 丰富内容"
                  ),
                  Vault: t(
                    "Optional plugins · Connected notes",
                    "可选插件 · 关联笔记"
                  ),
                }
                return (
                  <section key={group}>
                    <h2>{names[group]}</h2>
                    {entries.map((entry) => (
                      <button
                        type="button"
                        key={entry.id}
                        data-syntax-id={entry.id}
                        aria-pressed={entry.id === selected.id}
                        onClick={() => choose(entry)}
                      >
                        {entry[locale]}
                      </button>
                    ))}
                  </section>
                )
              }
            )}
            {!filtered.length && (
              <p>{t("No matching syntax.", "没有匹配的语法。")}</p>
            )}
          </nav>
        </aside>
        <section
          className="site-syntax-detail"
          aria-label={t("Selected syntax", "当前语法")}
        >
          <header>
            <h2>{selected[locale]}</h2>
            <p className="site-syntax-explanation">
              {syntaxLessons[selected.id][locale]}
            </p>
            <ul
              className="site-syntax-tags"
              aria-label={t("Available presets", "可用预设")}
            >
              {columns
                .filter((column) => supports(selected, column.id))
                .map((column) => (
                  <li key={column.id}>{column.name}</li>
                ))}
            </ul>
            <p className="site-lab-note">
              {t(
                "These tags identify editor presets, not full specification conformance.",
                "标签表示包含此示例的编辑器预设，不代表完整规范认证。"
              )}
            </p>
            <details className="site-syntax-preview-settings">
              <summary>{t("Preview settings", "预览设置")}</summary>
              <label className="site-preset-select">
                <span>{t("Preset", "预设")}</span>
                <select
                  aria-label={t("Preset", "预设")}
                  value={preset}
                  onChange={(event) => {
                    const next = columns.find(
                      (entry) => entry.id === event.target.value
                    )
                    if (next) choose(selected, next.id)
                  }}
                >
                  {columns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.name}
                    </option>
                  ))}
                </select>
              </label>

              <p>
                {t(
                  "Switching presets keeps your source; editor history restarts.",
                  "切换预设保留源码，编辑器撤销历史会重新开始。"
                )}
              </p>
            </details>
            <p>
              {supported
                ? modes[selected.mode]
                : t(
                    "Not part of this preset. Source stays literal or uses a safe fallback.",
                    "不属于此预设。源码保留为字面文本或安全回退。"
                  )}
            </p>
          </header>
          <div className="site-syntax-panels">
            <label className="site-syntax-source">
              <span>Markdown</span>
              <textarea
                aria-label={t("Example Markdown source", "示例 Markdown 源码")}
                spellCheck={false}
                value={source}
                onChange={(event) =>
                  setDrafts({ ...drafts, [selected.id]: event.target.value })
                }
              />
            </label>
            <div className="site-syntax-render">
              <div className="site-syntax-panel-label">
                {t("Live editor", "实际编辑效果")}
              </div>
              <MarkdownEditor
                documentKey={`syntax-${selected.id}`}
                {...(preset === "commonmark"
                  ? { preset: commonmarkPreset }
                  : { profile: preset })}
                markdown={source}
                onMarkdownChange={(value) =>
                  setDrafts((current) => ({
                    ...current,
                    [selected.id]: value,
                  }))
                }
                theme={theme}
                labels={locale === "zh" ? chineseEditorLabels : undefined}
                ariaLabel={t("Syntax preview editor", "语法预览编辑器")}
              />
            </div>
          </div>
          <div className="site-lab-controls">
            <button
              type="button"
              className="site-theme-toggle"
              onClick={() =>
                setDrafts({ ...drafts, [selected.id]: selected.source })
              }
            >
              {t("Reset example", "重置示例")}
            </button>
            <a
              href={
                preset === "commonmark"
                  ? href("/build")
                  : `${href("/playground")}?preset=${preset}`
              }
            >
              {preset === "commonmark"
                ? t("Build your editor →", "构建你的编辑器 →")
                : t("Open playground →", "打开交互体验 →")}
            </a>
          </div>
          <p className="site-lab-note">
            {t(
              "HTML never executes scripts. Vault embeds need a host and do not transclude notes here. Complex containers may use a visual preview with source editing.",
              "HTML 不执行脚本。笔记嵌入需要宿主支持，此处不展开其他笔记。复杂容器可能使用可视化预览与源码编辑。"
            )}
          </p>
        </section>
      </div>
    </main>
  )
}
