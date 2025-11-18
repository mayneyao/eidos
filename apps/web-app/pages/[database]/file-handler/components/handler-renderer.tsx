import type {
  FileHandlerMeta,
  IExtension,
} from "@/packages/core/types/IExtension"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { SimpleWebViewBlock } from "@/components/block-renderer/simple-webview-block"

interface HandlerRendererProps {
  handlerId: string
  filePath: string
}

export function HandlerRenderer({ handlerId, filePath }: HandlerRendererProps) {
  const { space } = useCurrentPathInfo()
  return (
    <SimpleWebViewBlock
      url={`http://${handlerId}.block.${space}.eidos.localhost:13127/#${filePath}`}
      height="100%"
    />
  )
}
