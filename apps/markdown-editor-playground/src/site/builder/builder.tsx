import { useEffect, useMemo, useRef, useState } from "react"
import { MarkdownEditor } from "@eidos.space/markdown"
import "@eidos.space/markdown/styles.css"
import { useSiteLocale } from "../locale"
import { chineseEditorLabels } from "../editor-labels"
import {
  builderPlugins,
  builderRequiredBy,
  builderInteractions,
  builderInteractionEnabled,
  selectedBuilderPlugins,
  startingPoints,
  startingConfig,
  parseBuilderConfig,
  resolveBuilder,
  type BuilderConfig,
} from "./model"
import "./builder.css"
import { integrationFiles, projectFiles } from "./project"
import { downloadProject } from "./zip"
import { useOpfsImageStorage } from "./image-storage"

function initialState(): { config: BuilderConfig; error: string } {
  try {
    return {
      config: parseBuilderConfig(
        new URLSearchParams(location.search).get("config")
      ),
      error: "",
    }
  } catch (error) {
    return {
      config: startingConfig("gfm"),
      error: error instanceof Error ? error.message : "Invalid configuration",
    }
  }
}

export default function Builder({ theme }: { theme: "light" | "dark" }) {
  const { t, locale, href } = useSiteLocale()
  const [initial] = useState(initialState)
  const [config, setConfig] = useState(initial.config)
  const [error, setError] = useState(initial.error)
  const resolved = useMemo(() => resolveBuilder(config), [config])
  const [markdown, setMarkdown] = useState(resolved.example)
  const [previous, setPrevious] = useState<string | null>(null)
  const [source, setSource] = useState(false)
  const [file, setFile] = useState("markdown-preset.ts")
  const files = useMemo(() => integrationFiles(config), [config])
  const activeFile = files[file] ? file : "markdown-preset.ts"
  const [downloading, setDownloading] = useState(false)
  const images = useOpfsImageStorage()
  const [message, setMessage] = useState("")
  const [panel, setPanel] = useState("preview")
  const selector = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !selector.current?.contains(event.target)
      ) {
        if (selector.current) selector.current.open = false
      }
    }
    document.addEventListener("pointerdown", dismiss)
    return () => document.removeEventListener("pointerdown", dismiss)
  }, [])
  useEffect(() => {
    const update = () => {
      const next = initialState()
      setConfig(next.config)
      setError(next.error)
    }
    window.addEventListener("popstate", update)
    return () => window.removeEventListener("popstate", update)
  }, [])
  function change(next: BuilderConfig) {
    setConfig(next)
    setError("")
    setMessage("")
    const url = new URL(location.href)
    url.searchParams.set("config", JSON.stringify(next))
    history.replaceState(null, "", url)
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setMessage(t("Copied.", "已复制。"))
    } catch {
      setMessage(
        t(
          "Clipboard unavailable. Select and copy the code below.",
          "剪贴板不可用，请选择下方代码手动复制。"
        )
      )
    }
  }
  function share() {
    const url = new URL(location.href)
    url.searchParams.set("config", JSON.stringify(config))
    void copy(url.href)
  }
  async function download() {
    setDownloading(true)
    try {
      await downloadProject(projectFiles(config))
      setMessage(
        t(
          "Project downloaded. Unzip, then run pnpm install and pnpm dev.",
          "项目已下载。解压后运行 pnpm install 和 pnpm dev。"
        )
      )
    } catch (error) {
      setMessage(
        t("Download failed: ", "下载失败：") +
          (error instanceof Error ? error.message : String(error))
      )
    } finally {
      setDownloading(false)
    }
  }
  const currentPreset =
    startingPoints.find(
      (id) => JSON.stringify(startingConfig(id)) === JSON.stringify(config)
    ) ?? "custom"
  return (
    <main id="site-main" className="builder-page" tabIndex={-1}>
      <header className="builder-intro">
        <div>
          <p className="site-eyebrow">BUILD / MARKDOWN</p>
          <h1>{t("Build your Markdown editor", "构建你的 Markdown 编辑器")}</h1>
          <p>
            {t(
              "Choose your syntax. Try it live. Take the code.",
              "选择语法，实时试写，带走代码。"
            )}
          </p>
        </div>
        <div className="builder-actions">
          <button type="button" onClick={share}>
            {t("Share configuration", "分享配置")}
          </button>
          <button
            type="button"
            disabled={downloading}
            onClick={() => void download()}
          >
            {downloading
              ? t("Preparing…", "正在打包…")
              : t("Download project", "下载项目")}
          </button>
        </div>
      </header>
      {error && (
        <p role="alert">
          {t(
            "The shared configuration could not be loaded. Showing GFM instead:",
            "无法加载分享的配置，暂时显示 GFM："
          )}{" "}
          {error}
        </p>
      )}
      <nav
        className="builder-mobile-tabs"
        aria-label={t("Builder panels", "工作台面板")}
      >
        {[
          ["preview", t("Preview", "预览")],
          ["code", t("Code", "代码")],
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            aria-pressed={panel === id}
            onClick={() => setPanel(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <details
        ref={selector}
        className="builder-selector"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.open = false
            event.currentTarget.querySelector("summary")?.focus()
          }
        }}
      >
        <summary>
          {t("Syntax & specs", "语法与 specs")} · {config.plugins.length}
        </summary>
        <aside
          className="builder-config"
          aria-label={t("Editor configuration", "编辑器配置")}
        >
          {resolved.usesImages && (
            <fieldset>
              <legend>{t("Host adapter", "宿主适配器")}</legend>
              <label className="builder-option">
                <input
                  type="checkbox"
                  checked={config.imageStorage === "opfs"}
                  onChange={(event) => {
                    const { imageStorage: _previous, ...rest } = config
                    change(
                      event.target.checked
                        ? { ...rest, imageStorage: "opfs" }
                        : rest
                    )
                  }}
                />
                {t("Local OPFS image storage", "本地 OPFS 图片存储")}
              </label>
              <p className="builder-note">
                {t(
                  "Pasted images stay in this browser. No upload. Requires localhost or HTTPS.",
                  "粘贴图片保存在当前浏览器，不上传。需要 localhost 或 HTTPS。"
                )}
              </p>
            </fieldset>
          )}
          <label className="builder-start">
            {t("Starting point", "从预设开始")}
            <select
              aria-label={t("Starting point", "从预设开始")}
              value={currentPreset}
              onChange={(event) => {
                const id = startingPoints.find(
                  (candidate) => candidate === event.target.value
                )
                if (id) change(startingConfig(id))
              }}
            >
              {currentPreset === "custom" && (
                <option value="custom">{t("Custom", "自定义")}</option>
              )}
              <optgroup label={t("Foundations", "基础预设")}>
                <option value="commonmark">CommonMark</option>
                <option value="gfm">GFM</option>
              </optgroup>
              <optgroup label={t("Other compositions", "其他组合示例")}>
                <option value="minimal">{t("Minimal", "最小配置")}</option>
                <option value="obsidian">Obsidian</option>
                <option value="eidos">Eidos</option>
              </optgroup>
            </select>
          </label>
          <p className="builder-note">
            {t(
              "Paragraphs, escapes and line endings stay available. Everything below is optional.",
              "段落、转义和换行始终可用，下方语法均可选择。"
            )}
          </p>
          {["CommonMark", "GFM", "Extended", "Vault"].map((group) => (
            <fieldset key={group}>
              <legend>
                {group === "Extended"
                  ? t("Optional plugins", "可选插件")
                  : group === "Vault"
                    ? t("Note connections & extras", "笔记关联与附加功能")
                    : group}
              </legend>
              {builderPlugins
                .filter((entry) => entry.group === group)
                .map((entry) => (
                  <label className="builder-option" key={entry.id}>
                    <input
                      type="checkbox"
                      disabled={builderRequiredBy(config, entry.id).length > 0}
                      title={builderRequiredBy(config, entry.id)
                        .map(
                          (dependent) =>
                            t("Required by ", "依赖方：") +
                            t(dependent.en, dependent.zh)
                        )
                        .join(", ")}
                      checked={config.plugins.includes(entry.id)}
                      onChange={(event) =>
                        change({
                          ...config,
                          plugins: selectedBuilderPlugins({
                            ...config,
                            plugins: builderPlugins
                              .filter((candidate) =>
                                candidate.id === entry.id
                                  ? event.target.checked
                                  : config.plugins.includes(candidate.id)
                              )
                              .map((candidate) => candidate.id),
                          }),
                        })
                      }
                    />
                    {t(entry.en, entry.zh)}
                  </label>
                ))}
            </fieldset>
          ))}
          {config.plugins.includes("task-list") && (
            <p className="builder-note">
              {t(
                "Task lists require Lists. Turn off Task lists before removing Lists.",
                "任务列表依赖列表。关闭任务列表后才能移除列表。"
              )}
            </p>
          )}
          {config.plugins.includes("reference") && (
            <p className="builder-note">
              {t(
                "Reference links include Links. Turn off References before removing Links.",
                "引用式链接会启用链接。关闭引用式链接后才能移除链接。"
              )}
            </p>
          )}
          <fieldset>
            <legend>{t("Interactions", "交互")}</legend>
            {builderInteractions.map((interaction) => (
              <label className="builder-option" key={interaction.id}>
                <input
                  type="checkbox"
                  checked={builderInteractionEnabled(config, interaction.id)}
                  onChange={(event) =>
                    change({
                      ...config,
                      interactions: {
                        ...config.interactions,
                        [interaction.id]: event.target.checked,
                      },
                    })
                  }
                />
                {t(interaction.en, interaction.zh)}
              </label>
            ))}
          </fieldset>
          <p className="builder-note">
            {t(
              "HTML safety always stays on. Disabling a syntax preserves its source; fallback blocks may use source editing.",
              "HTML 安全防护始终开启。关闭语法不会删除原文，回退块可能需要源码编辑。"
            )}
          </p>
          <a href={href("/spec")}>
            {t("Explore syntax examples →", "查看语法示例 →")}
          </a>
        </aside>
      </details>
      <div className="builder-workbench" data-panel={panel}>
        <section
          className="builder-preview"
          aria-label={t("Live editor preview", "编辑器实时预览")}
        >
          <div className="builder-bar">
            <strong>{t("Your editor", "你的编辑器")}</strong>
            <button
              type="button"
              aria-pressed={source}
              onClick={() => setSource(!source)}
            >
              {t("Markdown source", "Markdown 源码")}
            </button>
            <button
              type="button"
              onClick={() => {
                setPrevious(markdown)
                setMarkdown(resolved.example)
              }}
            >
              {t("Load example", "加载示例")}
            </button>
            {previous !== null && (
              <button
                type="button"
                onClick={() => {
                  setMarkdown(previous)
                  setPrevious(null)
                }}
              >
                {t("Restore draft", "恢复草稿")}
              </button>
            )}
          </div>
          <p className="builder-note builder-preview-note">
            {t(
              "Configuration changes keep your text and start a new undo history.",
              "修改配置保留正文，并重新开始撤销历史。"
            )}
          </p>
          {source ? (
            <textarea
              className="builder-source"
              aria-label={t("Markdown source", "Markdown 源码")}
              value={markdown}
              onChange={(event) => setMarkdown(event.target.value)}
              spellCheck={false}
            />
          ) : (
            <MarkdownEditor
              documentKey="builder-draft"
              preset={resolved.preset}
              markdown={markdown}
              onMarkdownChange={setMarkdown}
              theme={theme}
              showToolbar={config.toolbar}
              interactions={config.interactions}
              {...(resolved.useOpfs ? images : {})}
              labels={locale === "zh" ? chineseEditorLabels : undefined}
              onError={(error) => setError(error.message)}
            />
          )}
        </section>
        <section
          className="builder-code"
          aria-label={t("Generated integration code", "生成的集成代码")}
        >
          <div className="builder-bar">
            <strong>{t("Use it in your app", "集成到你的应用")}</strong>
            <button type="button" onClick={() => void copy(files[activeFile])}>
              {t("Copy code", "复制代码")}
            </button>
          </div>
          <div className="builder-files">
            {Object.keys(files).map((name) => (
              <button
                type="button"
                key={name}
                aria-pressed={activeFile === name}
                onClick={() => setFile(name)}
              >
                {name}
              </button>
            ))}
          </div>
          <pre tabIndex={0}>
            <code>{files[activeFile]}</code>
          </pre>
          <p className="builder-note">
            {t(
              "Copy the integration files, or download a runnable project with the package from this build. No document text is included.",
              "复制集成文件，或下载包含当前 package 的可运行项目。不会包含正在编辑的正文。"
            )}
          </p>
          {resolved.usesImages && (
            <p className="builder-note">
              {t(
                "Images use host callbacks. Enable the OPFS example above for local persistence, or connect your own storage. Browser data can be cleared; this is not a backup.",
                "图片通过宿主回调处理。开启 OPFS 示例可本地保存，也可以接入自己的存储。浏览器数据可能被清理，这不是备份。"
              )}
            </p>
          )}
          <p role="status" className="builder-note">
            {message}
          </p>
        </section>
      </div>
    </main>
  )
}
