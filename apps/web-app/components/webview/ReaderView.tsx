import { useTabContext } from "@/apps/web-app/components/tab-manager/tab-context"
import {
  useWebviewStore,
  defaultWebviewState,
} from "@/apps/web-app/store/webview-store"

export function ReaderView() {
  const { tabId } = useTabContext()
  const readerViewContent = useWebviewStore(
    (s) => s.states[tabId]?.readerViewContent || ""
  )

  if (!readerViewContent) return null

  return (
    <div className="relative flex flex-1 min-h-0 overflow-auto bg-background p-8">
      <div
        className="prose prose-sm dark:prose-invert max-w-3xl mx-auto"
        dangerouslySetInnerHTML={{
          __html: readerViewContent,
        }}
      />
    </div>
  )
}
