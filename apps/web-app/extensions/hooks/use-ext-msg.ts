import { useCallback } from "react"

import { MsgType } from "@/lib/const"
import { LocalSqlite } from "@/lib/sqlite/channel/local"
import { getWorker } from "@/lib/sqlite/worker"
import { efsManager } from "@/lib/storage/eidos-file-system"
import { uuidv7 } from "@/lib/utils"

import { useExtensions } from "./use-extensions"

export enum ExtMsgType {
  // incoming msg
  loadExtension = "loadExtension",
  loadExtensionAsset = "loadExtensionAsset",
  rpcCall = "rpcCall",
  // outgoing msg
  loadExtensionResp = "loadExtensionResp",
  loadExtensionAssetResp = "loadExtensionAssetResp",
  rpcCallResp = "rpcCallResp",
}

const sqlite = new LocalSqlite(getWorker())

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
    return event.origin === "null"
  }
  return false
}

export const useExtMsg = (source: ExtensionSourceType) => {
  const { getExtensionIndex } = useExtensions()

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
        case ExtMsgType.rpcCall:
          const { method, params, space } = event.data.data
          console.log("receive rpc call", method, params, space)
          const thisCallId = uuidv7()
          sqlite.send({
            type: MsgType.CallFunction,
            data: {
              method,
              params,
              dbName: space,
            },
            id: thisCallId,
          })
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
