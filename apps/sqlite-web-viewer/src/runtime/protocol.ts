import type { DatabaseSnapshot, RelationDetails, RelationPage } from "../types"

export type SQLiteViewerAction =
  | { bytes: ArrayBuffer; fileName: string; type: "open" }
  | { name: string; type: "details" }
  | { limit: number; name: string; offset: number; type: "page" }
  | { type: "close" }

export interface SQLiteViewerRequest {
  action: SQLiteViewerAction
  id: number
}

export type SQLiteViewerResult =
  | DatabaseSnapshot
  | RelationDetails
  | RelationPage
  | { closed: true }

export type SQLiteViewerResponse =
  | { id: number; ok: true; result: SQLiteViewerResult }
  | {
      error: { message: string; name: string; stack?: string }
      id: number
      ok: false
    }
