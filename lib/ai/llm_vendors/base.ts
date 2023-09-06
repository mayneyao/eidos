abstract class LLMBaseVendor {
  abstract name: string

  // text encoding and decoding
  abstract encode(text: string): number[]
  abstract decode(data: number[]): string

  // embedding
  abstract embedding(text: string[], model: string): Promise<number[][]>
}
