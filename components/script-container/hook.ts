import { useAppRuntimeStore } from "@/lib/store/runtime-store"

export const useScriptFunction = () => {
  const { scriptContainerRef } = useAppRuntimeStore()
  const callFunction = (props: {
    input: any
    context: any
    code: string
    command: string
    id: string
  }) => {
    const { input, context, code, id, command = "default" } = props
    console.log(props)
    scriptContainerRef?.current?.contentWindow?.postMessage(
      {
        type: "ScriptFunctionCall",
        data: {
          input,
          context,
          command,
          code,
          id,
        },
      },
      "*"
    )
  }
  return {
    callFunction,
  }
}
