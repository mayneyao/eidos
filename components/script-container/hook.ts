export const useScriptFunction = (
  iframeRef: React.RefObject<HTMLIFrameElement>
) => {
  const callFunction = (props: {
    input: any
    context: any
    code: string
    id: string
  }) => {
    const { input, context, code, id } = props
    iframeRef.current?.contentWindow?.postMessage(
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
