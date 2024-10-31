import { useMblock } from "@/hooks/use-mblock"

import { BlockRenderer } from "./block-renderer"

export const BlockApp = ({ id }: { id: string }) => {
  const block = useMblock(id)
  return (
    <BlockRenderer
      code={block?.ts_code ?? ""}
      compiledCode={block?.code ?? ""}
      env={block?.env_map ?? {}}
    />
  )
}
