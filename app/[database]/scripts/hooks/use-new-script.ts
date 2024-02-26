import { IScript } from "@/worker/web-worker/meta_table/script"
import { useNavigate } from "react-router-dom"

import { generateId } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"

import { useScript } from "./use-script"

export const useNewScript = () => {
  const { addScript } = useScript()
  const router = useNavigate()
  const { space } = useCurrentPathInfo()

  const handleCreateNewScript = async (
    template: "default" | "udf" = "default"
  ) => {
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

    const newUDFScript: IScript = {
      id: newScriptId,
      name: `myFunc`,
      commands: [],
      description: "twice the input",
      version: "0.0.1",
      code: `function myFunc(pCx, arg) {
        return arg + arg
}`,
      as_udf: true,
    }

    const templateMap = {
      default: newScript,
      udf: newUDFScript,
    }

    const script = templateMap[template]
    await addScript(script)
    router(`/${space}/scripts/${newScriptId}`)
  }

  return {
    handleCreateNewScript,
  }
}
