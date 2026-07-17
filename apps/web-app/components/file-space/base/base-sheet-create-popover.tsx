import { useId, useState, type FormEvent } from "react"
import type { CreateBaseTableInput } from "@eidos.space/base"
import { ArrowLeft, Plus, Table2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

import {
  BaseCsvImportPopover,
  type BaseCsvImportPopoverProps,
} from "./base-csv-import-popover"

type SheetCsvImportProps = Omit<
  BaseCsvImportPopoverProps,
  "onImported" | "triggerVariant"
>

export function BaseSheetCreatePopover({
  disabled = false,
  csvImportProps,
  onCreate,
}: {
  disabled?: boolean
  csvImportProps: SheetCsvImportProps
  onCreate: (table: CreateBaseTableInput) => Promise<void> | void
}) {
  const [open, setOpen] = useState(false)
  const [screen, setScreen] = useState<"menu" | "create">("menu")
  const [name, setName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameId = useId()

  const reset = () => {
    setScreen("menu")
    setName("")
    setSubmitting(false)
    setError(null)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const nextName = name.trim()
    if (!nextName || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await onCreate({ name: nextName })
      setOpen(false)
      reset()
    } catch (creationError) {
      setError(
        creationError instanceof Error
          ? creationError.message
          : "Unable to create table"
      )
      setSubmitting(false)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (submitting) return
        setOpen(nextOpen)
        if (!nextOpen) reset()
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-full w-8 shrink-0 items-center justify-center border-r text-muted-foreground outline-hidden hover:bg-background/70 hover:text-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50"
          aria-label="Add Base table"
          title="Add table"
          disabled={disabled}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={5}
        className="w-72 p-0"
      >
        {screen === "menu" ? (
          <div>
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Add table</h2>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                Start blank or import structured data from CSV.
              </p>
            </div>
            <div className="p-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto w-full items-start justify-start gap-3 rounded-md px-3 py-2.5 text-left"
                disabled={disabled}
                onClick={() => setScreen("create")}
              >
                <Table2 className="mt-0.5 h-3.5 w-3.5" />
                <span className="grid min-w-0 gap-0.5">
                  <span className="text-sm font-medium text-foreground">
                    New table
                  </span>
                  <span className="text-xs font-normal leading-4 text-muted-foreground">
                    Create an empty table in this Base.
                  </span>
                </span>
              </Button>
              <BaseCsvImportPopover
                {...csvImportProps}
                triggerVariant="sheet-create"
                onImported={() => {
                  setOpen(false)
                  reset()
                }}
              />
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start gap-2 border-b px-3 py-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                aria-label="Back to table options"
                disabled={submitting}
                onClick={() => {
                  setScreen("menu")
                  setError(null)
                }}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
              <div className="min-w-0 pt-0.5">
                <h2 className="text-sm font-semibold">New table</h2>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  Add an empty table to this Base.
                </p>
              </div>
            </div>
            <form onSubmit={(event) => void submit(event)}>
              <div className="grid gap-1.5 px-4 py-3">
                <label className="text-xs font-medium" htmlFor={nameId}>
                  Name
                </label>
                <Input
                  id={nameId}
                  value={name}
                  autoFocus
                  placeholder="Projects"
                  disabled={submitting}
                  onChange={(event) => setName(event.target.value)}
                />
                {error ? (
                  <p className="text-xs text-destructive" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center justify-end gap-2 border-t px-4 py-2.5">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={submitting}
                  onClick={() => {
                    setScreen("menu")
                    setError(null)
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={!name.trim() || submitting}>
                  {submitting ? "Creating…" : "Create"}
                </Button>
              </div>
            </form>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
