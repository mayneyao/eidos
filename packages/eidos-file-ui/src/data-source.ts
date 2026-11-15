import type {
  EidosFileDataSource,
  EidosFileSnapshot,
} from "@eidos.space/eidos-file"

/** Editor-level additions built from normative Runtime mutations. */
export interface EidosFileEditorDataSource extends EidosFileDataSource {
  reorderTables?(tableIds: string[]): Promise<EidosFileSnapshot>
  /** Whether any row in the full Table has SQL NULL for this Field. */
  hasNullValues?(tableId: string, fieldId: string): Promise<boolean>
}

export type { EidosFileDataSource } from "@eidos.space/eidos-file"
