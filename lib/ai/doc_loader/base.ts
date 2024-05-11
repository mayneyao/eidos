export abstract class BaseLoader {
  abstract load(docId: string): Promise<
    {
      content: string
      meta: Record<string, any>
    }[]
  >
}
