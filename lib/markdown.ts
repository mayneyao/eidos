export const getAllCodeBlocks = (markdown: string, lang: string = "sql") => {
  const codeBlockRegex = new RegExp(`\`\`\`${lang}([\\s\\S]*?)\`\`\``, "g")
  const codeBlocks = markdown.match(codeBlockRegex)
  return codeBlocks
}

export const getSQLFromMarkdownCodeBlock = (
  codeBlock: string,
  lang: string = "sql"
) => {
  const codeBlockRegex = new RegExp(`\`\`\`${lang}([\\s\\S]*?)\`\`\``)
  const sql = codeBlock.match(codeBlockRegex)?.[1].trim()
  // remove comments
  const sqlWithoutComments = sql?.replace(/--.*\n/g, "\n")
  return sqlWithoutComments
}
