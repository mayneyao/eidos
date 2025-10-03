export const getAllCodeBlocks = (
  markdown: string
): {
  code: string
  lang: string
}[] => {
  const codeBlockRegex = new RegExp(/```([a-z]*)\n([\s\S]*?)\n```/gim)
  const codeBlocks = markdown.matchAll(codeBlockRegex)
  const code = Array.from(codeBlocks).map((codeBlock) => ({
    code: codeBlock[2],
    lang: codeBlock[1],
  }))
  return code
}

/**
 * get all code blocks from llm-response tags
 * @param markdown
 * @returns
 */
export const getAllLLMResponseCodeBlocks = (
  markdown: string
): {
  code: string
  lang: string
}[] => {
  const llmResponseRegex = new RegExp(
    /<llm-response(?:\s+language=["']([^"']*)["'])?[^>]*>([\s\S]*?)<\/llm-response>/gim
  )
  const llmResponses = markdown.matchAll(llmResponseRegex)
  const code = Array.from(llmResponses).map((response) => ({
    code: response[2].trim(),
    lang: response[1] || "markdown", // Default to markdown
  }))
  return code
}

/**
 * get all links from markdown, but not include image
 * @param markdown
 * @returns
 */
export const getAllLinks = (markdown: string): string[] => {
  const linkRegex = new RegExp(/(?<!\!)\[([^\]]*)\]\(([^)]*)\)/gim)
  const links = markdown.matchAll(linkRegex)
  const linkArr = Array.from(links)
    .map((link) => link[2])
    .filter((link) => link.length > 0)
  return Array.from(new Set(linkArr))
}

// export const getSQLFromMarkdownCodeBlock = (
//   codeBlock: string,
//   lang: string = "sql"
// ) => {
//   const codeBlockRegex = new RegExp(`\`\`\`${lang}([\\s\\S]*?)\`\`\``)
//   const sql = codeBlock.match(codeBlockRegex)?.[1].trim()
//   // remove comments
//   const sqlWithoutComments = sql?.replace(/--.*\n/g, "\n")
//   return sqlWithoutComments
// }

// export const getD3JsCodeFromMarkdownCodeBlock = (
//   codeBlock: string,
//   lang: string = "js"
// ) => {
//   const codeBlockRegex = new RegExp(`\`\`\`${lang}([\\s\\S]*?)\`\`\``)
//   const js = codeBlock.match(codeBlockRegex)?.[1].trim()
//   return js
// }

// TODO: combo sql & js
// TODO:
export const getCodeFromMarkdown = (
  markdown: string
): { code: string; lang: string }[] => {
  const codeBlocks = getAllCodeBlocks(markdown)
  const llmResponseBlocks = getAllLLMResponseCodeBlocks(markdown)
  return [...codeBlocks, ...llmResponseBlocks]
}
