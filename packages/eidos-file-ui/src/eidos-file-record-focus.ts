import type { EidosFileRow } from "@eidos.space/eidos-file"

/** Locate a record without opening its inspector or changing edit selections. */
export interface EidosFileRecordFocus {
  row: EidosFileRow
  /** Position in the active query, when the host has resolved it. */
  index?: number | null
  /** A repeated request for the same record can reveal it again. */
  token: number
}
