import { MsgType } from "@/lib/const"
import { DataSpace } from "@/worker/web-worker/DataSpace"

export interface IHttpSendData {
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
