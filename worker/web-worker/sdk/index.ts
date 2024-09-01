import { DataSpace } from "../DataSpace"

export interface Eidos {
  space(spaceName: string): DataSpace
  currentSpace: DataSpace

  utils: {
    /**
     * we can't use fetch directly in the iframe, so we need to use this method to fetch resource
     * Note: it return Blob, not Response
     * 
     * for example:
     * 
     * const blob = await eidos.fetchBlob("https://example.com/file.zip", {
     *   method: "GET",
     *   headers: {
     *     "Content-Type": "application/zip",
     *   },
     * })
     * 
     * @param url 
     * @param options 
     * @returns
     */
    fetchBlob(url: string, options: RequestInit): Promise<Blob>

    /**
     * highlight the row if it is in the current view
     * @param tableId 
     * @param rowId 
     * @param fieldId 
     */
    tableHighlightRow(tableId: string, rowId: string, fieldId?: string): void
  }

}

export interface EidosTable<T = Record<string, string>> {
  id: string
  name: string
  fieldsMap: T
}
