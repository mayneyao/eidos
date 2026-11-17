export interface ContentLinkDocument {
  tableId: string
  rowId: string
  fieldId: string
  content: string
}

export interface ContentLinkSnapshot {
  revision: string
  documents: ContentLinkDocument[]
}

export type ContentLinkUpdate = ContentLinkSnapshot

export interface ContentLinkUpdateResult {
  updated: boolean
  skipped: boolean
}
