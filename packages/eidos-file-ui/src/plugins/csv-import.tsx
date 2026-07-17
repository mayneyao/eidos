import { useRef } from "react"
import type {
  EidosFileCsvImportOptions,
  EidosFileCsvImportPlan,
  EidosFileCsvImportResult,
  EidosFileSnapshot,
} from "@eidos.space/eidos-file"

import { EidosFileCsvImportPopover } from "../eidos-file-csv-import-popover"
import { defineEidosFilePlugin, type EidosFilePluginContext } from "../plugin"

export interface EidosFileCsvImportSource {
  id: string
  fileName: string
}

export interface EidosFileCsvImportAdapter {
  pickFile(): Promise<EidosFileCsvImportSource | null>
  preview(
    source: EidosFileCsvImportSource,
    options: EidosFileCsvImportOptions
  ): Promise<EidosFileCsvImportPlan>
  import(
    source: EidosFileCsvImportSource,
    options: EidosFileCsvImportOptions
  ): Promise<{
    snapshot: EidosFileSnapshot
    result: EidosFileCsvImportResult
  }>
  release?(source: EidosFileCsvImportSource): void
}

export interface EidosFileCsvImportPluginOptions {
  id?: string
  label?: string
  order?: number
  copy?: Partial<EidosFileCsvImportCopy>
}

export interface EidosFileCsvImportCopy {
  actionAriaLabel: string
  actionLabel: string
  cancel: string
  chooseAnother: string
  choosePrompt: string
  dialogTitle: string
  fieldName: string
  fieldType: string
  fileSummary: string
  importRows: string
  importing: string
  localOnly: string
  parsing: string
  preview: string
  tableName: string
  titleType: string
  typeCheckbox: string
  typeDate: string
  typeDatetime: string
  typeNumber: string
  typeText: string
  typeUrl: string
  unableToImport: string
  unableToRead: string
}

const DEFAULT_COPY: EidosFileCsvImportCopy = {
  actionAriaLabel: "Import CSV as a new Eidos File table",
  actionLabel: "Import CSV",
  cancel: "Cancel",
  chooseAnother: "Choose another",
  choosePrompt: "Choose a CSV file to inspect it.",
  dialogTitle: "Import CSV as a new table",
  fieldName: "Field {index} name",
  fieldType: "{name} type",
  fileSummary: "{file} · {count} rows",
  importRows: "Import {count} rows",
  importing: "Importing…",
  localOnly: "CSV parsing and writes stay local to this editor.",
  parsing: "Parsing and inferring fields in the runtime worker…",
  preview: "Preview",
  tableName: "Table name",
  titleType: "Title",
  typeCheckbox: "Checkbox",
  typeDate: "Date",
  typeDatetime: "Date & time",
  typeNumber: "Number",
  typeText: "Text",
  typeUrl: "URL",
  unableToImport: "Unable to import CSV",
  unableToRead: "Unable to read CSV",
}

function CanonicalCsvImportAction({
  adapter,
  copy,
  context,
}: {
  adapter: EidosFileCsvImportAdapter
  copy: EidosFileCsvImportCopy
  context: EidosFilePluginContext
}) {
  const sources = useRef(new Map<string, EidosFileCsvImportSource>())

  return (
    <EidosFileCsvImportPopover
      triggerVariant="sheet-create"
      copy={copy}
      disabled={context.disabled}
      onSelect={async () => {
        const source = await adapter.pickFile()
        if (!source) return { canceled: true, token: null, fileName: null }
        sources.current.set(source.id, source)
        return {
          canceled: false,
          token: source.id,
          fileName: source.fileName,
        }
      }}
      onPreview={async (token, options) => {
        const source = sources.current.get(token)
        if (!source) throw new Error("The selected CSV is no longer available")
        return adapter.preview(source, options)
      }}
      onImport={async (token, options) => {
        const source = sources.current.get(token)
        if (!source) throw new Error("The selected CSV is no longer available")
        const imported = await adapter.import(source, options)
        context.onSnapshot(imported.snapshot)
        context.onTableSelect?.(imported.result.table.id)
        adapter.release?.(source)
        sources.current.delete(token)
      }}
      onProgress={async () => null}
      onCancel={async () => false}
    />
  )
}

export function createEidosFileCsvImportPlugin(
  adapter: EidosFileCsvImportAdapter,
  options: EidosFileCsvImportPluginOptions = {}
) {
  const id = options.id ?? "@eidos.space/eidos-file-ui/csv-import"
  const copy = {
    ...DEFAULT_COPY,
    ...options.copy,
    ...(options.label ? { actionLabel: options.label } : {}),
  }
  return defineEidosFilePlugin({
    id,
    actions: [
      {
        id: `${id}:sheet-create`,
        slot: "sheet-create" as const,
        order: options.order ?? 20,
        render: (context: EidosFilePluginContext) => (
          <CanonicalCsvImportAction
            adapter={adapter}
            context={context}
            copy={copy}
          />
        ),
      },
    ],
  })
}
