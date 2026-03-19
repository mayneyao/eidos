import { getBuiltInExtensionById } from "@/extensions/builtin"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useRouterAdapter } from "@/hooks/use-router-adapter"
import { SimpleWebViewBlock } from "@/components/block-renderer/simple-webview-block"
import { BuiltInFileHandlerRenderer } from "@/apps/web-app/components/block-renderer/builtin-extension-renderer"

interface HandlerRendererProps {
  handlerId: string
  filePath: string
}

export function HandlerRenderer({ handlerId, filePath }: HandlerRendererProps) {
  const { space } = useCurrentPathInfo()
  const { searchParams } = useRouterAdapter()

  // Check if this is a built-in handler (indicated by query param or by ID prefix)
  const isBuiltin =
    searchParams.get("builtin") === "true" || handlerId.startsWith("builtin-")

  // For built-in handlers, render directly in React (no iframe)
  if (isBuiltin) {
    const builtInExt = getBuiltInExtensionById(handlerId)
    if (builtInExt) {
      // Extract slug from ID (remove 'builtin-' prefix)
      const slug = handlerId.replace("builtin-", "")
      return (
        <BuiltInFileHandlerRenderer
          extensionSlug={slug}
          space={space}
          filePath={filePath}
        />
      )
    }
  }

  // For third-party handlers, use WebView (iframe sandbox)
  // Use key={filePath} to force re-create webview when file changes
  // This ensures the extension page fully reloads with the new context
  return (
    <SimpleWebViewBlock
      key={filePath}
      url={`http://${handlerId}.block.${space}.eidos.localhost:13127/#${filePath}`}
      height="100%"
    />
  )
}
