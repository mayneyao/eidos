import { ArrowLeft, AlertTriangle, X } from "lucide-react"

import { Button } from "@/components/ui/button"

import {
  EidosFileRecordInspector,
  type EidosFileRecordInspectorProps,
} from "./eidos-file-record-inspector"

type EidosFileRecordPageProps = Omit<
  EidosFileRecordInspectorProps,
  "variant" | "onClose" | "onOpenInTab"
> & {
  eidosFileName: string
  tableName: string
  error?: string | null
  onBack: () => void
  onDismissError?: () => void
}

function EidosFileRecordWorkbar({
  eidosFileName,
  tableName,
  onBack,
}: {
  eidosFileName: string
  tableName?: string
  onBack: () => void
}) {
  return (
    <div className="eidos-shell-workbar flex shrink-0 items-center gap-1 border-b bg-muted/15 px-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 gap-1.5 px-2 text-xs"
        onClick={onBack}
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to Eidos File
      </Button>
      <span className="text-muted-foreground/50" aria-hidden="true">
        /
      </span>
      <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
        <span className="truncate">{eidosFileName}</span>
        {tableName ? (
          <>
            <span className="shrink-0 text-muted-foreground/50">/</span>
            <span className="truncate text-foreground">{tableName}</span>
          </>
        ) : null}
      </div>
    </div>
  )
}

export function EidosFileRecordPage({
  eidosFileName,
  tableName,
  error,
  onBack,
  onDismissError,
  ...inspectorProps
}: EidosFileRecordPageProps) {
  return (
    <div
      className="relative flex h-full min-h-0 flex-col bg-background"
      data-eidos-file-record-page
    >
      <EidosFileRecordWorkbar
        eidosFileName={eidosFileName}
        tableName={tableName}
        onBack={onBack}
      />
      {error ? (
        <div
          className="flex shrink-0 items-start gap-2 border-b border-destructive/20 bg-destructive/5 px-3 py-1.5 text-xs text-destructive"
          role="alert"
        >
          <span className="min-w-0 flex-1 break-words py-0.5">{error}</span>
          {onDismissError ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5 shrink-0 text-destructive hover:text-destructive"
              aria-label="Dismiss Eidos File error"
              onClick={onDismissError}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 justify-center overflow-hidden bg-muted/10 px-[clamp(0px,3vw,40px)]">
        <EidosFileRecordInspector variant="page" {...inspectorProps} />
      </div>
    </div>
  )
}

export function EidosFileRecordUnavailable({
  eidosFileName,
  message,
  onBack,
}: {
  eidosFileName: string
  message: string
  onBack: () => void
}) {
  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background"
      data-eidos-file-record-page
    >
      <EidosFileRecordWorkbar eidosFileName={eidosFileName} onBack={onBack} />
      <div className="flex min-h-0 flex-1 items-center justify-center px-8 text-center">
        <div className="flex max-w-sm flex-col items-center gap-3">
          <AlertTriangle
            className="h-5 w-5 text-muted-foreground"
            aria-hidden="true"
          />
          <div>
            <h2 className="text-sm font-medium">Unable to open record</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {message}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onBack}>
            Back to Eidos File
          </Button>
        </div>
      </div>
    </div>
  )
}
