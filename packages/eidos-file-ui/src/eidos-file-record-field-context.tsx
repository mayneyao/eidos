import type { ReactNode } from "react"
import type {
  EidosFileSnapshot,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import type { EidosFileEditorDataSource } from "./data-source"
import { EidosFileUIProvider, useEidosFileUI } from "./context"

export interface RecordFieldManagement {
  source: EidosFileEditorDataSource
  table: EidosFileTableSnapshot
  tables?: readonly EidosFileTableSnapshot[]
  view?: EidosFileViewInfo
  disabled: boolean
  onSnapshot?: (snapshot: EidosFileSnapshot) => void
}

/** Internal wiring: record management shares the existing editor mutation boundary. */
export function RecordFieldManagementProvider({
  children,
  ...value
}: RecordFieldManagement & { children: ReactNode }) {
  return (
    <EidosFileUIProvider recordFieldManagement={value}>
      {children}
    </EidosFileUIProvider>
  )
}

export function useRecordFieldManagement() {
  return useEidosFileUI().recordFieldManagement
}
