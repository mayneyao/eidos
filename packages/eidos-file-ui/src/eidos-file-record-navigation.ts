import type { EidosFileRow } from "@eidos.space/eidos-file"

export interface EidosFileRecordNeighbors {
  previous: EidosFileRow | null
  next: EidosFileRow | null
}

export function eidosFileRecordNeighbors(
  rows: readonly EidosFileRow[],
  currentRow: EidosFileRow | null | undefined
): EidosFileRecordNeighbors {
  if (!currentRow) return { previous: null, next: null }
  const currentId = String(currentRow._id ?? "")
  const index = rows.findIndex((row) => String(row._id ?? "") === currentId)
  if (index < 0) return { previous: null, next: null }
  return {
    previous: rows[index - 1] ?? null,
    next: rows[index + 1] ?? null,
  }
}
