import { MsgType } from "@/lib/const"

import { ISqlite } from "../interface"

interface IHttpSendData {
  type: MsgType.CallFunction
  data: {
    method: string
    params: any[]
    dbName: string
    tableId?: string
    userId?: string
  }
  id: string
}

export class HttpSqlite implements ISqlite<string, IHttpSendData> {
  connector: string // URL of the server

  responseMap: Map<string, any> = new Map()
  constructor(connector: string) {
    this.connector = connector
    this.responseMap = new Map()
  }

  async send(data: IHttpSendData) {
    const response = await fetch(this.connector, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      throw new Error("Network response was not ok")
    }
    const responseData = await response.json()
    this.responseMap.set(data.id, responseData)
  }

  async onCallBack(
    thisCallId: string,
    timeout: number = 15000,
    interval: number = 100
  ) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now()

      const checkResponse = () => {
        const responseData = this.responseMap.get(thisCallId)
        if (responseData) {
          try {
            if (responseData.status === "success") {
              resolve(responseData.result)
            } else {
              reject(new Error(responseData.result))
            }
          } catch (error) {
            reject(new Error(`Error: ${error instanceof Error ? error.message : '未知错误'}`))
          } finally {
            this.responseMap.delete(thisCallId)
          }
          clearInterval(polling)
        } else if (Date.now() - startTime >= timeout) {
          reject(new Error("Timeout"))
          clearInterval(polling)
        }
      }

      const polling = setInterval(checkResponse, interval)
    })
  }
}