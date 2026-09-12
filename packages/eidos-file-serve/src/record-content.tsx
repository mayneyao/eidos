import { useCallback, type ReactNode } from "react"
import {
  EidosFileUIProvider,
  useEidosFileUI,
  type EidosFileMarkdownEditorRequest,
} from "@eidos.space/eidos-file-ui/context"
import { MarkdownEditor } from "@eidos.space/markdown"
import { eidosPreset } from "@eidos.space/markdown/presets"
import { renderMarkdownToHtml } from "@eidos.space/markdown/static"
import "@eidos.space/markdown/styles.css"
import "@eidos.space/markdown/static.css"

function RecordContentEditor({
  cacheKey,
  content,
  disabled,
  onChange,
}: EidosFileMarkdownEditorRequest) {
  const {
    themeName,
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
    <MarkdownEditor
      documentKey={cacheKey}
      markdown={content}
      onMarkdownChange={onChange}
      readOnly={disabled}
      theme={themeName}
      layout="embedded"
      inputProfile="fragment"
      preset={eidosPreset}
      baseUri={contentImageBaseUrl}
      resolveImageUrl={resolveImageUrl}
      onOpenExternalUrl={activateUrl}
    />
  )
}

const renderMarkdownEditor = (request: EidosFileMarkdownEditorRequest) => (
  <RecordContentEditor {...request} />
)
const renderMarkdownHtml = (markdown: string) => ({
  html: renderMarkdownToHtml(markdown),
  className: "eme-static",
})

/** Browser hosts share the editor; filesystem capabilities stay in host adapters. */
export function RecordContentProvider({ children }: { children: ReactNode }) {
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
