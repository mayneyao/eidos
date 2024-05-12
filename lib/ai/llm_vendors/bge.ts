import { embeddingTexts } from "@/lib/embedding/worker"
import { LLMBaseVendor } from "./base"

export class BGEM3 implements LLMBaseVendor {
  name = "gbe-m3"

  async embedding(text: string[], model: string): Promise<number[][]> {
    const embeddings = await embeddingTexts(text)
    return embeddings as number[][]
  }
}
