import { embeddingTexts } from "@/lib/embedding/worker"
import { LLMBaseVendor } from "./base"

export class BGEM3 implements LLMBaseVendor {
  name = "gbe-m3"

  _embedding?: (text: string[]) => Promise<number[][]>
  constructor(embedding?: (text: string[]) => Promise<number[][]>) {
    this._embedding = embedding
  }

  async embedding(text: string[], model: string): Promise<number[][]> {
    if (this._embedding) {
      return this._embedding(text)
    }
    const embeddings = await embeddingTexts(text)
    return embeddings as number[][]
  }
}
