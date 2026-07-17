import { useEffect, useId, useMemo, useState, type FormEvent } from "react"
import {
  EIDOS_FILE_EXTENSION,
  type CreateEidosFileOptions,
} from "@eidos.space/eidos-file"
import { CheckSquare2, Table2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"

import { validateSpaceEntryName } from "../file-path"
import {
  eidosFileOptionsForTemplate,
  normalizeEidosFileName,
  type EidosFileTemplateId,
} from "./eidos-file-create-options"

export function EidosFileCreatePopover({
  open,
  initialName,
  initialTemplate = "blank",
  existingNames,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  initialName: string
  initialTemplate?: EidosFileTemplateId
  existingNames: string[]
  onOpenChange: (open: boolean) => void
  onCreate: (
    name: string,
    options: CreateEidosFileOptions
  ) => Promise<void> | void
}) {
  const [name, setName] = useState(initialName)
  const [template, setTemplate] = useState<EidosFileTemplateId>(initialTemplate)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameId = useId()

  useEffect(() => {
    if (!open) return
    setName(initialName)
    setTemplate(initialTemplate)
    setSubmitting(false)
    setError(null)
  }, [initialName, initialTemplate, open])

  const normalizedName = useMemo(() => normalizeEidosFileName(name), [name])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const validationError = validateSpaceEntryName(normalizedName)
    if (validationError) {
      setError(validationError)
      return
    }
    if (
      existingNames.some(
        (candidate) => candidate.toLowerCase() === normalizedName.toLowerCase()
      )
    ) {
      setError(`A file named “${normalizedName}” already exists.`)
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const title = normalizedName.slice(0, -EIDOS_FILE_EXTENSION.length)
      await onCreate(
        normalizedName,
        eidosFileOptionsForTemplate(title, template)
      )
      onOpenChange(false)
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to create Eidos File"
      )
    } finally {
      setSubmitting(false)
    }
  }

  const templates: Array<{
    id: EidosFileTemplateId
    title: string
    description: string
    icon: typeof Table2
  }> = [
    {
      id: "blank",
      title: "Blank Eidos File",
      description: "An empty table ready for your own fields.",
      icon: Table2,
    },
    {
      id: "tasks",
      title: "Task tracker",
      description: "Status, priority, due date, and completion fields.",
      icon: CheckSquare2,
    },
  ]

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <span className="pointer-events-none absolute right-2 top-7 h-px w-px" />
      </PopoverAnchor>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={4}
        className="w-[380px] max-w-[calc(100vw-24px)] p-0"
      >
        <form onSubmit={(event) => void submit(event)}>
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">New Eidos File</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Create a portable structured-data file inside this Space.
            </p>
          </div>

          <div className="space-y-4 px-4 py-3">
            <label
              className="grid gap-1.5 text-xs font-medium"
              htmlFor={nameId}
            >
              File name
              <Input
                id={nameId}
                value={name}
                autoFocus
                spellCheck={false}
                placeholder="Projects.eidos"
                aria-invalid={Boolean(error)}
                onChange={(event) => {
                  setName(event.target.value)
                  setError(null)
                }}
              />
            </label>

            <fieldset className="grid gap-2">
              <legend className="mb-1 text-xs font-medium">Start from</legend>
              {templates.map((candidate) => {
                const Icon = candidate.icon
                const selected = template === candidate.id
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    className={cn(
                      "flex w-full items-start gap-3 rounded-md border px-3 py-3 text-left outline-hidden transition-colors",
                      selected
                        ? "border-foreground/30 bg-muted/55"
                        : "border-border hover:bg-muted/30",
                      "focus-visible:ring-1 focus-visible:ring-ring"
                    )}
                    aria-pressed={selected}
                    onClick={() => setTemplate(candidate.id)}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {candidate.title}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {candidate.description}
                      </span>
                    </span>
                  </button>
                )
              })}
            </fieldset>

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
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !normalizedName}>
              {submitting ? "Creating…" : "Create Eidos File"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
