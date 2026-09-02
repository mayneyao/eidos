import {
  type CodeHighlightToken,
  tokenizeCodeLightweight,
} from "./code-highlight-tokenizer"

async function tokenize(
  code: string,
  language: string
): Promise<readonly CodeHighlightToken[]> {
  return await tokenizeCodeLightweight(code, language)
}

function valuesFor(
  code: string,
  tokens: readonly CodeHighlightToken[],
  kind: CodeHighlightToken["kind"]
): string[] {
  return tokens
    .filter((token) => token.kind === kind)
    .map((token) => code.slice(token.start, token.end))
}

describe("lightweight code tokenizer", () => {
  it("tokenizes TypeScript semantically without matching inside strings or comments", async () => {
    const code = `type MarkdownDocument = {
  canonical: "const hidden",
}

// const ignored = true
const document: MarkdownDocument = createDocument(42)
`
    const tokens = await tokenize(code, "ts")

    expect(valuesFor(code, tokens, "keyword")).toEqual(["type", "const"])
    expect(valuesFor(code, tokens, "string")).toEqual(['"const hidden"'])
    expect(valuesFor(code, tokens, "comment")).toEqual([
      "// const ignored = true",
    ])
    expect(valuesFor(code, tokens, "type")).toContain("MarkdownDocument")
    expect(valuesFor(code, tokens, "function")).toEqual(["createDocument"])
    expect(valuesFor(code, tokens, "number")).toEqual(["42"])
  })

  it("supports data formats and leaves plain text unhighlighted", async () => {
    const json = '{"ready": true, "count": 3}'
    const jsonTokens = await tokenize(json, "json")

    expect(valuesFor(json, jsonTokens, "property")).toEqual([
      '"ready"',
      '"count"',
    ])
    expect(valuesFor(json, jsonTokens, "keyword")).toEqual(["true"])
    expect(valuesFor(json, jsonTokens, "number")).toEqual(["3"])
    await expect(tokenize("ordinary text", "plaintext")).resolves.toEqual([])
  })
})
