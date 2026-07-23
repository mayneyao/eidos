import type {
  EidosFileDataSource,
  EidosFileSnapshot,
} from "@eidos.space/eidos-file"

/** Editor-level additions built from normative Runtime mutations. */
export interface EidosFileEditorDataSource extends EidosFileDataSource {
  reorderTables?(tableIds: string[]): Promise<EidosFileSnapshot>
}

export type { EidosFileDataSource } from "@eidos.space/eidos-file"
