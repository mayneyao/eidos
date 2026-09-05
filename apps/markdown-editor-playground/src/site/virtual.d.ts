declare module "virtual:markdown-documents" {
  const documents: readonly {
    route: string
    title: string
    locale: "en" | "zh"
    guide: boolean
    html: string
    headings: readonly { id: string; title: string; level: number }[]
  }[]
  export default documents
}
