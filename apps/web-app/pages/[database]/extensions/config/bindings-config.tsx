import { useState } from "react"
import type { IExtension } from "@/packages/core/meta-table/extension"
import type { IBindings } from "@/packages/core/types/IExtension"
import { useLoaderData, useRevalidator } from "react-router-dom"

import { useExtension } from "@/apps/web-app/hooks/use-extension"
import { ExtensionBindings } from "./extension-bindings"

export const BindingsConfig = () => {
  const extension = useLoaderData() as IExtension
  const revalidator = useRevalidator()
  const [bindings, setBindings] = useState<IBindings>(extension.bindings || {})
  const { updateExtension } = useExtension()

  const handleUpdateBindings = async (newBindings: IBindings) => {
    setBindings(newBindings)
    try {
      await updateExtension({
        id: extension.id,
        bindings: newBindings,
      })
      revalidator.revalidate()
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