import type { ReactNode } from "react"
import { CheckSquare2, LoaderCircle, Plus, Table2 } from "lucide-react"

import { Button } from "@/components/ui/button"

export type EidosFileEmptyStateTemplate = "blank" | "tasks"

export function EidosFileEmptyState({
  disabled = false,
  creatingTemplate = null,
  templateError = null,
  importAction,
  onCreateTemplate,
}: {
  disabled?: boolean
  creatingTemplate?: EidosFileEmptyStateTemplate | null
  templateError?: {
    template: EidosFileEmptyStateTemplate
    message: string
  } | null
  importAction: ReactNode
  onCreateTemplate: (template: EidosFileEmptyStateTemplate) => void
}) {
  return (
    <section
      className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10 text-center"
      aria-labelledby="eidos-file-empty-state-title"
      aria-describedby="eidos-file-empty-state-description"
    >
      <Table2 className="mb-3 h-5 w-5 text-muted-foreground" />
      <h2 id="eidos-file-empty-state-title" className="text-sm font-medium">
        Start this Eidos File
      </h2>
      <p
        id="eidos-file-empty-state-description"
        className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground"
      >
        Create an empty table, start with a task workflow, or bring in existing
        CSV data.
      </p>

      <div
        className="mt-4 flex max-w-full flex-wrap items-center justify-center gap-2"
        aria-label="Ways to create the first Eidos File table"
        role="group"
      >
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5 px-3 text-xs"
          disabled={disabled || creatingTemplate !== null}
          onClick={() => onCreateTemplate("blank")}
        >
          {creatingTemplate === "blank" ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          {creatingTemplate === "blank"
            ? "Creating…"
            : templateError?.template === "blank"
              ? "Retry blank table"
              : "Blank table"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-3 text-xs"
          disabled={disabled || creatingTemplate !== null}
          onClick={() => onCreateTemplate("tasks")}
        >
          {creatingTemplate === "tasks" ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <CheckSquare2 className="h-3.5 w-3.5" />
          )}
          {creatingTemplate === "tasks"
            ? "Creating…"
            : templateError?.template === "tasks"
              ? "Retry task tracker"
              : "Task tracker"}
        </Button>
        {importAction}
      </div>

      {templateError ? (
        <p
          className="mt-3 max-w-md break-words text-xs text-destructive"
          role="alert"
        >
          {templateError.message}
        </p>
      ) : null}
    </section>
  )
}
