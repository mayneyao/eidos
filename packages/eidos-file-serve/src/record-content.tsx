import { useCallback, useEffect, useRef, type ReactNode } from "react"
import {
  EidosFileUIProvider,
  useEidosFileUI,
  type EidosFileMarkdownEditorRequest,
} from "@eidos.space/eidos-file-ui/context"
import { MarkdownEditor, type MarkdownEditorProps } from "@eidos.space/markdown"
import { eidosPreset } from "@eidos.space/markdown/presets"
import { renderMarkdownToHtml } from "@eidos.space/markdown/static"
import "@eidos.space/markdown/styles.css"
import "@eidos.space/markdown/static.css"

/** Shared touch interactions for standalone files and record content. */
export const mobileMarkdownOptions = {
  toolbarMode: "mobile",
  interactions: {
    toolbar: true,
    blockDrag: false,
    blockSelection: false,
    insertMenu: false,
  },
  labels: {
    imageSettings: "图片设置",
    closeImageSettings: "关闭图片设置",
    imageUrl: "图片地址",
    imageAlt: "替代文字",
    imageTitle: "图片标题",
    deleteImage: "删除图片",
    invalidImageUrl: "请输入有效的图片地址",
    saveImage: "保存",
    insertBlock: "插入内容",
    basicBlocks: "基础块",
    textFormat: "文字格式",
    hideKeyboard: "收起键盘",
    closeFind: "关闭面板",
    indent: "增加缩进",
    outdent: "减少缩进",
    paragraph: "正文",
    heading1: "一级标题",
    heading3: "三级标题",
    numberedList: "有序列表",
    codeBlock: "代码块",
    bold: "加粗",
    italic: "斜体",
    strikethrough: "删除线",
    highlight: "高亮",
    inlineCode: "行内代码",
    undo: "撤销",
    redo: "重做",
    heading2: "二级标题",
    quote: "引用",
    bulletList: "无序列表",
    checkList: "待办列表",
    image: "图片",
    attachFile: "文件",
  },
} satisfies Partial<MarkdownEditorProps>

export function getMobileMarkdownOptions(locale: "zh" | "en") {
  return locale === "zh"
    ? mobileMarkdownOptions
    : { ...mobileMarkdownOptions, labels: undefined }
}

type MobileEditorHost = Pick<
  MarkdownEditorProps,
  "onDismissKeyboard" | "onImportFiles"
>

function RecordContentEditor({
  cacheKey,
  content,
  disabled,
  onChange,
  focusRequestToken = 0,
  onDismissKeyboard,
  onImportFiles,
}: EidosFileMarkdownEditorRequest & MobileEditorHost) {
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!disabled && focusRequestToken > 0) {
      containerRef.current
        ?.querySelector<HTMLElement>('[contenteditable="true"]')
        ?.focus({ preventScroll: true })
    }
  }, [disabled, focusRequestToken])
  const {
    themeName,
    locale,
    interactionMode,
    activateUrl,
    contentImageBaseUrl,
    resolveMarkdownImageUrl,
  } = useEidosFileUI()
  const resolveImageUrl = useCallback(
    async ({ markdownUrl }: { markdownUrl: string }) =>
      (await resolveMarkdownImageUrl?.(markdownUrl)) ?? null,
    [resolveMarkdownImageUrl]
  )
  return (
    <div ref={containerRef}>
      <MarkdownEditor
        documentKey={cacheKey}
        markdown={content}
        onMarkdownChange={onChange}
        readOnly={disabled}
        theme={themeName}
        layout="embedded"
        autoFocus={false}
        inputProfile="fragment"
        {...(interactionMode === "mobile"
          ? getMobileMarkdownOptions(locale)
          : {})}
        onDismissKeyboard={onDismissKeyboard}
        onImportFiles={onImportFiles}
        preset={eidosPreset}
        baseUri={contentImageBaseUrl}
        resolveImageUrl={resolveImageUrl}
        onOpenExternalUrl={activateUrl}
      />
    </div>
  )
}

const renderMarkdownEditor = (request: EidosFileMarkdownEditorRequest) => (
  <RecordContentEditor {...request} />
)
const renderMarkdownHtml = (
  markdown: string,
  { imageBaseUrl }: { imageBaseUrl?: string }
) => {
  const html = renderMarkdownToHtml(markdown)
  if (!imageBaseUrl) return { html, className: "eme-static" }
  // Resolve before mounting: an effect runs after the browser has already
  // requested relative images against the editor shell's URL.
  const template = document.createElement("template")
  template.innerHTML = html
  const base = new URL(imageBaseUrl, window.location.href)
  for (const image of template.content.querySelectorAll("img[src]")) {
    const source = image.getAttribute("src")!
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/iu.test(source)) continue
    try {
      const url = new URL(source, base)
      if (["http:", "https:"].includes(url.protocol))
        image.setAttribute("src", url.href)
    } catch {
      image.removeAttribute("src")
    }
  }
  return { html: template.innerHTML, className: "eme-static" }
}

/** Browser hosts share the editor; filesystem capabilities stay in host adapters. */
export function RecordContentProvider({
  children,
  onDismissKeyboard,
  onImportFiles,
}: { children: ReactNode } & MobileEditorHost) {
  const renderMarkdownEditor = useCallback(
    (request: EidosFileMarkdownEditorRequest) => (
      <RecordContentEditor
        {...request}
        onDismissKeyboard={onDismissKeyboard}
        onImportFiles={onImportFiles}
      />
    ),
    [onDismissKeyboard, onImportFiles]
  )
  const { contentImageBaseUrl, resolveMarkdownImageUrl } = useEidosFileUI()
  const resolveImage = useCallback(
    async (markdownUrl: string) => {
      const resolved = await resolveMarkdownImageUrl?.(markdownUrl)
      if (resolved) return resolved
      if (!contentImageBaseUrl) return null
      try {
        const base = new URL(contentImageBaseUrl, window.location.href)
        const url = new URL(markdownUrl, base)
        return ["http:", "https:"].includes(url.protocol) ? url.href : null
      } catch {
        return null
      }
    },
    [contentImageBaseUrl, resolveMarkdownImageUrl]
  )
  return (
    <EidosFileUIProvider
      markdownEditingMode="wysiwyg"
      renderMarkdownEditor={renderMarkdownEditor}
      renderMarkdownHtml={renderMarkdownHtml}
      resolveMarkdownImageUrl={resolveImage}
    >
      {children}
    </EidosFileUIProvider>
  )
}
