declare module "defuddle/node" {
  export function Defuddle(
    document: Document,
    url: string,
    options?: {
      markdown?: boolean
      separateMarkdown?: boolean
      removeExactSelectors?: boolean
      removePartialSelectors?: boolean
      removeHiddenElements?: boolean
      removeLowScoring?: boolean
      removeSmallImages?: boolean
      removeImages?: boolean
      useAsync?: boolean
      standardize?: boolean
      contentSelector?: string
      language?: string
      includeReplies?: boolean | string
      debug?: boolean
    }
  ): Promise<{
    content: string
    contentMarkdown?: string
    title?: string
    description?: string
    author?: string
    site?: string
    domain?: string
    favicon?: string
    image?: string
    language?: string
    published?: string
    wordCount?: number
    parseTime?: number
    metaTags?: object[]
    schemaOrgData?: object
    extractorType?: string
    debug?: object
  }>
}
