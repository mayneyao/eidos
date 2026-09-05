import { useState } from "react"
import { BasicExample, initialMarkdown } from "./basic-example"
import exampleSource from "./basic-example.tsx?raw"
import { useSiteLocale } from "./locale"
import { chineseEditorLabels } from "./editor-labels"

const chineseMarkdown = `# 给思考一点空间

自然地书写，文档始终是 **Markdown**。

- 选中文字，调整格式
- 在空行输入 /，插入新的内容块
- 拖动把手，调整块的顺序

## 让想法自由流动

- [x] 拥有自己的内容
- [ ] 写下值得记录的事

一个行内公式：$e^{i\\pi} + 1 = 0$。
`

export default function LiveExample({ theme }: { theme: "light" | "dark" }) {
  const { locale, t, href } = useSiteLocale()
  const exampleMarkdown = locale === "zh" ? chineseMarkdown : initialMarkdown
  const [source, setSource] = useState(false)
  const [readOnly, setReadOnly] = useState(false)
  const [markdown, setMarkdown] = useState(exampleMarkdown)
  const [resetFrom, setResetFrom] = useState<string | null>(null)
  return (
    <section
      className="site-example"
      aria-label={t("Interactive example", "交互示例")}
    >
      <div className="site-example-bar">
        <span className="site-example-title">
          {t("The editor, live", "直接试写")}
        </span>
        <div className="site-example-controls">
          <button
            type="button"
            aria-pressed={readOnly}
            onClick={() => setReadOnly(!readOnly)}
          >
            {t("Read only", "只读")}
          </button>
          <button
            type="button"
            aria-pressed={source}
            onClick={() => setSource(!source)}
          >
            {source ? t("Hide code", "隐藏代码") : t("View code", "查看代码")}
          </button>
          <button
            type="button"
            onClick={() => {
              setResetFrom(markdown)
              setMarkdown(exampleMarkdown)
            }}
          >
            {t("Reset example", "重置示例")}
          </button>
        </div>
      </div>
      <div className="site-example-canvas" hidden={source}>
        <BasicExample
          markdown={markdown}
          onMarkdownChange={(value) => {
            setMarkdown(value)
            setResetFrom(null)
          }}
          theme={theme}
          readOnly={readOnly}
          ariaLabel={t("Try the Markdown editor", "试用 Markdown 编辑器")}
          placeholder={t("Write with Markdown…", "用 Markdown 开始书写…")}
          labels={locale === "zh" ? chineseEditorLabels : undefined}
        />
      </div>
      {source ? (
        <pre
          className="site-example-code"
          tabIndex={0}
          aria-label={t("Example React source", "React 示例代码")}
        >
          <code>{exampleSource}</code>
        </pre>
      ) : null}
      <div className="site-example-caption">
        <span>
          {t(
            "Changes stay in this page. Nothing is uploaded.",
            "编辑仅保留在当前页面，不会上传。"
          )}
        </span>
        {resetFrom !== null ? (
          <button
            type="button"
            onClick={() => {
              setMarkdown(resetFrom)
              setResetFrom(null)
            }}
          >
            {t("Undo reset", "撤销重置")}
          </button>
        ) : (
          <a href={href("/playground")}>
            {t("Open full playground ↗", "打开完整交互体验 ↗")}
          </a>
        )}
      </div>
    </section>
  )
}
