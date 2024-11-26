import { useState } from "react"
import { IScript } from "@/worker/web-worker/meta-table/script"
import { useLoaderData, useRevalidator } from "react-router-dom"

import { useToast } from "@/components/ui/use-toast"

import { useScript } from "../hooks/use-script"
import { Bindings } from "./Bindings"
import { EnvironmentVariables } from "./EnvironmentVariables"

export const BlockConfig = () => {
  const block = useLoaderData() as IScript
  const [envMap, setEnvMap] = useState<Record<string, string>>(
    block.env_map || {}
  )
  const [bindings, setBindings] = useState<
    Record<string, { type: "table"; value: string }>
  >(block.bindings || {})

  const revalidator = useRevalidator()
  const { toast } = useToast()
  const { updateScript } = useScript()

  const updateWithToast = async (
    newEnvMap = envMap,
    newBindings = bindings
  ) => {
    try {
      await updateScript({
        id: block.id,
        env_map: newEnvMap,
        bindings: newBindings,
      })
      revalidator.revalidate()
      toast({ title: "Block Updated Successfully" })
    } catch (error) {
      toast({
        title: "Failed to update block",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  const handleUpdateBindings = (
    newBindings: Record<string, { type: "table"; value: string }>
  ) => {
    setBindings(newBindings)
    updateWithToast(envMap, newBindings)
  }

  return (
    <div className="flex flex-col gap-4">
      <EnvironmentVariables
        envMap={envMap}
        onUpdateEnvMap={(newEnvMap) => {
          setEnvMap(newEnvMap)
          updateWithToast(newEnvMap)
        }}
      />
      <Bindings bindings={bindings} onUpdateBindings={handleUpdateBindings} />
    </div>
  )
}
