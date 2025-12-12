import { useState } from "react"
import type { IExtension } from "@/packages/core/meta-table/extension"
import type { IBindings } from "@/packages/core/types/IExtension"

import {
  useExtension,
  useExtensionByIdOrSlug,
} from "@/apps/web-app/hooks/use-extension"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"

import { ExtensionBindings } from "./extension-bindings"

const BindingsConfigContent = ({ extension }: { extension: IExtension }) => {
  const [bindings, setBindings] = useState<IBindings>(extension.bindings || {})
  const { updateExtension } = useExtension()

  const handleUpdateBindings = async (newBindings: IBindings) => {
    setBindings(newBindings)
    try {
      await updateExtension({
        id: extension.id,
        bindings: newBindings,
      })
      // Data will auto-update via BroadcastChannel
    } catch (error) {
      console.error("Failed to update extension bindings", error)
    }
  }

  return (
    <ExtensionBindings
      bindings={bindings}
      onUpdateBindings={handleUpdateBindings}
    />
  )
}

export const BindingsConfig = () => {
  const { params } = useRouterAdapter()
  const extension = useExtensionByIdOrSlug(params.scriptId)

  if (!extension) {
    return null
  }

  return <BindingsConfigContent extension={extension} />
}
