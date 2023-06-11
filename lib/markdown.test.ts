import { getAllCodeBlocks, getSQLFromMarkdownCodeBlock } from "./markdown"

describe("getAllCodeBlocks", () => {
  it("should return all code blocks", () => {
    const markdown = `
      # Hello World
      \`\`\`sql
      SELECT * FROM table;
      \`\`\`
      \`\`\`sql
      SELECT * FROM table;
      \`\`\`
    `
    const codeBlocks = getAllCodeBlocks(markdown)
    expect(codeBlocks).toHaveLength(2)
    codeBlocks?.forEach((codeBlock) => {
      expect(getSQLFromMarkdownCodeBlock(codeBlock)).toEqual(
        "SELECT * FROM table;"
      )
    })
  })
})
