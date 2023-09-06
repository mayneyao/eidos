import { decode as _decode, encode as _encode } from "gpt-tokenizer"
import OpenAI from "openai"

export class LLMOpenAI implements LLMBaseVendor {
  name = "openai"
  openai: OpenAI
  constructor(openai: OpenAI) {
    this.openai = openai
  }
  encode(text: string): number[] {
    return _encode(text)
  }

  decode(data: number[]): string {
    return _decode(data)
  }

  async embedding(text: string[], model: string): Promise<number[][]> {
    if (!this.openai) {
      throw new Error("openai is not set")
    }
    const res = await this.openai.embeddings.create({
      input: text,
      model,
    })
    return res.data.map((item) => item.embedding)
  }
}
