import { IScript } from "@/worker/web-worker/meta-table/script"
import { useLoaderData } from "react-router-dom"

import { BlockConfig } from "./block-config"
import { PromptConfig } from "./prompt-config"
import { ScriptConfig } from "./script-config"

export const ExtensionConfig = () => {
  const script = useLoaderData() as IScript
  if (script.type === "prompt") {
    return <PromptConfig />
  }
  if (script.type === "script") {
    return <ScriptConfig />
  }
  if (script.type === "m_block") {
    return <BlockConfig />
  }
  return null
}
