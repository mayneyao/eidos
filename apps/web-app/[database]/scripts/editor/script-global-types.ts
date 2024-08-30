type Message = {
  id: string
  tool_call_id?: string
  createdAt?: Date
  content: string
  role: "system" | "user" | "assistant" | "function" | "data" | "tool"
}

type LLMCallInput = {
  messages: Message[]
  message: Message
  msgIndex: number
}

type Input = Record<string, any> & LLMCallInput

type CallType = "TableAction" | "ChatAction" | "CmdkAction"

interface Context {
  tables: any | null
  env: Record<string, any> | null
  currentNodeId?: string | null
  currentRowId?: string | null
  currentViewId?: string | null
  callFrom: CallType
  currentViewQuery?: string | null
  callFromTableAction?: boolean
}
