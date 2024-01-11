import { IScript } from "@/worker/web-worker/meta_table/script"
import { useNavigate } from "react-router-dom"

import { generateId } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"

import { useScript } from "./use-script"

export const useNewScript = () => {
  const { addScript } = useScript()
  const router = useNavigate()
  const { space } = useCurrentPathInfo()

  const handleCreateNewScript = async () => {
    const newScriptId = generateId()
    const newScript: IScript = {
      id: newScriptId,
      name: `New Script - ${newScriptId}`,
      commands: [],
      description: "Script Description",
      version: "0.0.1",
      code: `export default async function (input, context) {
    console.log('hello eidos!')
}`,
    }
    await addScript(newScript)
    router(`/${space}/scripts/${newScriptId}`)
  }

  return {
    handleCreateNewScript,
  }
}
