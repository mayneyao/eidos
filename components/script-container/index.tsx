import { useEffect, useRef } from "react"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useExtMsg } from "@/app/extensions/hooks/use-ext-msg"

import iframeHTML from "./iframe.html?raw"

// ScriptContainer used to run script in iframe
export const ScriptContainer = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const { handleMsg } = useExtMsg()
  useEffect(() => {
    window.addEventListener("message", handleMsg)
    return () => {
      window.removeEventListener("message", handleMsg)
    }
  }, [handleMsg])
  const { space } = useCurrentPathInfo()

  const iframeContent = iframeHTML.replace("${{currentSpace}}", space)

  useEffect(() => {
    if (iframeRef.current) {
      ;(window as any).test = () =>
        iframeRef.current?.contentWindow?.postMessage(
          {
            type: "ScriptFunctionCall",
            data: {
              input: { content: "add todo" },
              context: {
                env: {},
                tables: {
                  todos: {
                    id: "tb_4d2d09a52e014de69a85a9600aafdee0",
                    fieldsMap: {
                      title: {
                        name: "title",
                      },
                    },
                  },
                },
              },
              code: `
/// <reference path="eidos.d.ts" />
export const name = "Todo";
export const description = "Add a todo to the table";
export default async function (input, context) {
    console.log("Hello Eidos!");
    const tableId = context.tables.todos.id;
    const fieldMap = context.tables.todos.fieldsMap;
    const res = await eidos.currentSpace.addRow(tableId, {
        [fieldMap.title.name]: input.content,
    });
    console.log(res);
}`,
            },
          },
          "*"
        )
    }
  }, [])
  return (
    <iframe
      ref={iframeRef}
      srcDoc={iframeContent}
      sandbox="allow-scripts allow-same-origin"
      width="0"
      height="0"
      frameBorder="0"
    >
      {" "}
      Your browser does not support iframes.{" "}
    </iframe>
  )
}
