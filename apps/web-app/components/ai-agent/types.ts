import type { serverTools } from "@/packages/ai"
import type { UIMessage } from "ai"
import type { MessageMetadata } from "@/packages/core/types"

type BaseMessage = UIMessage<
  MessageMetadata,
  Record<string, unknown>,
  {
    [K in keyof typeof serverTools]: {
      input: any
      output: any
    }
  }
>

export type ChatMessage = Omit<BaseMessage, "role"> & {
  role: BaseMessage["role"] | "tool" | string
}
