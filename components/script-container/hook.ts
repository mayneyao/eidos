import { useAppRuntimeStore } from "@/lib/store/runtime-store"

export const useScriptFunction = () => {
  const { scriptContainerRef } = useAppRuntimeStore()
  const callFunction = (props: {
    input: any
    context: any
    code: string
    id: string
  }) => {
    const { input, context, code, id } = props
    console.log(props)
    scriptContainerRef?.current?.contentWindow?.postMessage(
      {
        type: "ScriptFunctionCall",
        data: {
          input,
          context,
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
