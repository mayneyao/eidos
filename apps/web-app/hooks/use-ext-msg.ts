import { useCallback } from "react"

import { MsgType } from "@/lib/const"
import { uuidv7 } from "@/lib/utils"

import { useAiConfig } from "@/apps/web-app/hooks/use-ai-config"
import { useScriptCall } from "@/apps/web-app/hooks/use-script-call"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { isDesktopMode } from "@/lib/env"
import { getSqliteChannel } from "@/packages/core/sqlite/channel"
import { generateObject, generateText, jsonSchema } from "ai"


export enum ExtMsgType {
  // incoming msg
  loadExtension = "loadExtension",
  loadExtensionAsset = "loadExtensionAsset",
  rpcCall = "rpcCall",
  // outgoing msg
  loadExtensionResp = "loadExtensionResp",
  loadExtensionAssetResp = "loadExtensionAssetResp",
  rpcCallResp = "rpcCallResp",

  // script container => main thread
  scriptCallMain = "scriptCallMain",
  scriptCallMainResp = "scriptCallMainResp",
  scriptCallMainError = "scriptCallMainError",
}

const sqlite = getSqliteChannel("publish-default-space", "publish-default-user")

/**
 * we have two source type, app and script yet.
 * all extension related msg will be handled by this hook
 */
export enum ExtensionSourceType {
  App = "app",
  Script = "script",
}

const shouldHandle = (event: MessageEvent, source: ExtensionSourceType) => {
  if (source === ExtensionSourceType.App) {
    return event.origin.startsWith("http")
  }
  if (source === ExtensionSourceType.Script) {
    return true
    return event.origin === "null"
  }
  return false
}

export const useExtMsg = (source: ExtensionSourceType) => {
  const { setRunningCommand } = useAppRuntimeStore()

  const { getLLModel, textModel, getConfigByModel } = useAiConfig()
  const { callScript } = useScriptCall()

  const handleMsg = useCallback(
    async (event: MessageEvent) => {
      if (!shouldHandle(event, source)) {
        return
      }
      const { type, name } = event.data
      switch (type) {
        // case ExtMsgType.loadExtension:
        //   try {
        //     const text = await getExtensionIndex(name)
        //     event.ports[0].postMessage({
        //       type: ExtMsgType.loadExtensionResp,
        //       text,
        //     })
        //   } catch (error) {
        //     console.error("Error loading extension:", error)
        //   }
        //   break
        // case ExtMsgType.loadExtensionAsset:
        //   try {
        //     const { url } = event.data
        //     const _url = new URL(url)
        //     const extName = _url.hostname.split(".")[0]
        //     const paths = _url.pathname.split("/").filter(Boolean)
        //     const file = await efsManager.getFile(["extensions", "apps", extName, ...paths])
        //     const contentType = file.type
        //     if (contentType.startsWith("text")) {
        //       const text = await file.text()
        //       const data = {
        //         type: "loadExtensionAssetResp",
        //         text,
        //         contentType,
        //       }
        //       event.ports[0].postMessage(data)
        //     } else {
        //       const buffer = await file.arrayBuffer()
        //       const data = {
        //         type: "loadExtensionAssetResp",
        //         text: buffer,
        //         contentType,
        //       }
        //       event.ports[0].postMessage(data)
        //     }
        //   } catch (error) {
        //     console.error("Error loading extension asset:", error)
        //   }
        //   break
        case ExtMsgType.scriptCallMain:
          // script container => main thread, does not include database operation
          console.log("receive script call main", event.data)
          const { method: _method, args: _args } = event.data.data
          switch (_method) {
            case "fetchBlob":
              try {
                const res = await fetch(_args[0], _args[1])
                const blob = await res.blob()
                event.ports[0].postMessage({
                  type: ExtMsgType.scriptCallMainResp,
                  data: blob,
                })
              } catch (error) {
                event.ports[0].postMessage({
                  type: ExtMsgType.scriptCallMainError,
                  data: error,
                })
              }
              break
            case "callScript":
              try {
                const [scriptId, input] = _args
                const res = await callScript(scriptId, input)
                event.ports[0].postMessage({
                  type: ExtMsgType.scriptCallMainResp,
                  data: res,
                })
              } catch (error) {
                event.ports[0].postMessage({
                  type: ExtMsgType.scriptCallMainError,
                  data: error,
                })
                setRunningCommand(null)
              }
              break
            case "generateObject":
              try {
                console.log("receive generate object", _args)
                const payload = _args[0]
                const llmodel = getLLModel(payload.model || textModel)

                if (isDesktopMode) {
                  const { object } = await window.eidos.AI.generateObject({
                    model: payload.model || textModel,
                    prompt: payload.prompt,
                    schema: jsonSchema(payload.schema),
                  })
                  console.log("generate object", object)
                  event.ports[0].postMessage({
                    type: ExtMsgType.scriptCallMainResp,
                    data: object,
                  })
                } else {
                  const { object } = await generateObject({
                    model: llmodel,
                    prompt: payload.prompt,
                    schema: jsonSchema(payload.schema),
                  })
                  console.log("generate object", object)
                  event.ports[0].postMessage({
                    type: ExtMsgType.scriptCallMainResp,
                    data: object,
                  })
                }
              } catch (error) {
                event.ports[0].postMessage({
                  type: ExtMsgType.scriptCallMainError,
                  data: error,
                })
                console.log("generate object error", error)
              } finally {
                setRunningCommand(null)
              }
              break
            case "generateText":
              try {
                console.log("receive generate text", _args)
                const payload = _args[0]
                const llmodel = getLLModel(payload.model || textModel)

                if (isDesktopMode) {
                  const { text } = await window.eidos.AI.generateText({
                    model: payload.model || textModel,
                    prompt: payload.prompt,
                  })
                  event.ports[0].postMessage({
                    type: ExtMsgType.scriptCallMainResp,
                    data: text,
                  })
                } else {
                  const { text } = await generateText({
                    model: llmodel,
                    prompt: payload.prompt,
                  })
                  event.ports[0].postMessage({
                    type: ExtMsgType.scriptCallMainResp,
                    data: text,
                  })
                }
              } catch (error) {
                event.ports[0].postMessage({
                  type: ExtMsgType.scriptCallMainError,
                  data: error,
                })
              } finally {
                setRunningCommand(null)
              }
              break
            case "tableHighlightRow":
              const [tableId, rowId, fieldId] = _args
              window.postMessage({
                type: MsgType.HighlightRow,
                payload: {
                  tableId: tableId,
                  rowId: rowId,
                  fieldId: fieldId,
                },
              })
              event.ports[0].postMessage({
                type: ExtMsgType.scriptCallMainResp,
                data: null,
              })
              break
            default:
              break
          }

          break
        case ExtMsgType.rpcCall:
          // query database
          const { method, params, space, scope, args } = event.data.data
          console.log("receive rpc call", method, params, space)
          const thisCallId = uuidv7()
          const res = sqlite.send({
            type: MsgType.CallFunction,
            data: {
              method,
              params,
              dbName: space,
            },
            id: thisCallId,
          })
          if (res) {
            try {
              const _res = await res
              console.log(thisCallId, "receive data from worker", _res)
              event.ports[0].postMessage({
                type: ExtMsgType.rpcCallResp,
                data: _res,
              })
            } catch (error) {
              console.error("Error in RPC call:", error)
            }
            return
          }
          try {
            const res = await sqlite.onCallBack(thisCallId)
            console.log(thisCallId, "receive data from worker", res)
            event.ports[0].postMessage({
              type: ExtMsgType.rpcCallResp,
              data: res,
            })
          } catch (error) {
            console.error("Error in RPC callback:", error)
          }
          break
        default:
          // console.log("unknown msg type", type)
          break
      }
    },
    [source]
  )

  return {
    handleMsg,
  }
}
