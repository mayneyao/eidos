import type { serverTools } from "@/packages/ai"
import type { UIMessage } from "ai"

type BaseMessage = UIMessage<
  unknown,
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
