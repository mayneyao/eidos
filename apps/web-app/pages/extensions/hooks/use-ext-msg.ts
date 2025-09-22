import { useCallback } from "react"

import { MsgType } from "@/lib/const"
import { uuidv7 } from "@/lib/utils"

import { useAiConfig } from "@/apps/web-app/hooks/use-ai-config"
import { useEidosFileSystemManager } from "@/apps/web-app/hooks/use-fs"
import { useScriptCall } from "@/apps/web-app/hooks/use-script-call"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { getSqliteChannel } from "@/packages/core/sqlite/channel"
import { generateObject, generateText, jsonSchema } from "ai"
import { useExtensions } from "./use-extensions"
import { isDesktopMode } from "@/lib/env"


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
  const { getExtensionIndex } = useExtensions()
  const { setRunningCommand } = useAppRuntimeStore()

  const { getLLModel, textModel } = useAiConfig()
  const { callScript } = useScriptCall()

  const { efsManager } = useEidosFileSystemManager()
  const handleMsg = useCallback(
    (event: MessageEvent) => {
      if (!shouldHandle(event, source)) {
        return
      }
      const { type, name } = event.data
      switch (type) {
        case ExtMsgType.loadExtension:
          getExtensionIndex(name).then((text) => {
            event.ports[0].postMessage({
              type: ExtMsgType.loadExtensionResp,
              text,
            })
          })
          break
        case ExtMsgType.loadExtensionAsset:
          const { url } = event.data
          const _url = new URL(url)
          const extName = _url.hostname.split(".")[0]
          const paths = _url.pathname.split("/").filter(Boolean)
          efsManager
            .getFile(["extensions", "apps", extName, ...paths])
            .then((file) => {
              const contentType = file.type
              if (contentType.startsWith("text")) {
                file.text().then((text) => {
                  const data = {
                    type: "loadExtensionAssetResp",
                    text,
                    contentType,
                  }
                  event.ports[0].postMessage(data)
                })
              } else {
                file.arrayBuffer().then((buffer) => {
                  const data = {
                    type: "loadExtensionAssetResp",
                    text: buffer,
                    contentType,
                  }
                  event.ports[0].postMessage(data)
                })
              }
            })
          break
        case ExtMsgType.scriptCallMain:
          // script container => main thread, does not include database operation
          console.log("receive script call main", event.data)
          const { method: _method, args: _args } = event.data.data
          switch (_method) {
            case "fetchBlob":
              fetch(_args[0], _args[1]).then(async (res) => {
                const blob = await res.blob()
                event.ports[0].postMessage({
                  type: ExtMsgType.scriptCallMainResp,
                  data: blob,
                })
              })
              break
            case "callScript":
              const [scriptId, input] = _args
              callScript(scriptId, input).then((res) => {
                event.ports[0].postMessage({
                  type: ExtMsgType.scriptCallMainResp,
                  data: res,
                })
              }).catch((error) => {
                event.ports[0].postMessage({
                  type: ExtMsgType.scriptCallMainError,
                  data: error,
                })
                setRunningCommand(null)
              })
              break
            case "generateObject":
              try {
                console.log("receive generate object", _args)
                const payload = _args[0]
                const llmodel = getLLModel(payload.model || textModel)
                let _generateObject = isDesktopMode ? window.eidos.AI.generateObject : generateObject
                _generateObject({
                  model: llmodel,
                  prompt: payload.prompt,
                  schema: jsonSchema(payload.schema),
                }).then(({ object }) => {
                  console.log("generate object", object)
                  event.ports[0].postMessage({
                    type: ExtMsgType.scriptCallMainResp,
                    data: object,
                  })
                }).catch((error) => {
                  event.ports[0].postMessage({
                    type: ExtMsgType.scriptCallMainError,
                    data: error,
                  })
                  console.log("generate object error", error)
                  setRunningCommand(null)
                })
              } catch (error) {
                event.ports[0].postMessage({
                  type: ExtMsgType.scriptCallMainError,
                  data: error,
                })
                setRunningCommand(null)
              }
              break
            case "generateText":
              try {
                console.log("receive generate text", _args)
                const payload = _args[0]
                const llmodel = getLLModel(payload.model || textModel)
                // forward request to backend avoid CORS issue
                let _generateText = isDesktopMode ? window.eidos.AI.generateText : generateText
                _generateText({
                  model: llmodel,
                  prompt: payload.prompt,
                }).then(({ text }) => {
                  event.ports[0].postMessage({
                    type: ExtMsgType.scriptCallMainResp,
                    data: text,
                  })
                }).catch((error) => {
                  event.ports[0].postMessage({
                    type: ExtMsgType.scriptCallMainError,
                    data: error,
                  })
                  setRunningCommand(null)
                })
              } catch (error) {
                event.ports[0].postMessage({
                  type: ExtMsgType.scriptCallMainError,
                  data: error,
                })
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
            res.then((_res) => {
              console.log(thisCallId, "receive data from worker", _res)
              event.ports[0].postMessage({
                type: ExtMsgType.rpcCallResp,
                data: _res,
              })
            })
            return
          }
          sqlite.onCallBack(thisCallId).then((res) => {
            console.log(thisCallId, "receive data from worker", res)
            event.ports[0].postMessage({
              type: ExtMsgType.rpcCallResp,
              data: res,
            })
          })
          break
        default:
          // console.log("unknown msg type", type)
          break
      }
    },
    [getExtensionIndex, source]
  )

  return {
    handleMsg,
  }
}
