import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"

interface EidosFileRenameDialogProps {
  kind: "table" | "field"
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onRename: (name: string) => Promise<void> | void
}

export function EidosFileRenameDialog({
  kind,
  name,
  open,
  onOpenChange,
  onRename,
}: EidosFileRenameDialogProps) {
  const [nextName, setNextName] = useState(name)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generationRef = useRef(0)
  const nameId = useId()
  const descriptionId = useId()
  const errorId = useId()

  useEffect(() => {
    generationRef.current += 1
    if (!open) return
    setNextName(name)
    setSubmitting(false)
    setError(null)
  }, [name, open])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = nextName.trim()
    if (submitting || !trimmed || trimmed === name) return
    const generation = ++generationRef.current
    setSubmitting(true)
    setError(null)
    try {
      await onRename(trimmed)
      if (generation !== generationRef.current) return
      onOpenChange(false)
    } catch (renameError) {
      if (generation !== generationRef.current) return
      setError(
        renameError instanceof Error
          ? renameError.message
          : `Unable to rename ${kind}`
      )
    } finally {
      if (generation === generationRef.current) setSubmitting(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <span className="pointer-events-none absolute right-2 top-10 h-px w-px" />
      </PopoverAnchor>
      <PopoverContent align="end" side="bottom" className="w-80 p-0">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Rename {kind}</h2>
          <p
            id={descriptionId}
            className="mt-0.5 text-xs leading-5 text-muted-foreground"
          >
            This changes the display name inside the Eidos File.
          </p>
        </div>
        <form onSubmit={submit}>
          <div className="px-4 py-3">
            <label
              className="grid gap-1.5 text-xs font-medium"
              htmlFor={nameId}
            >
              Name
              <Input
                id={nameId}
                value={nextName}
                autoFocus
                disabled={submitting}
                aria-describedby={
                  error ? `${descriptionId} ${errorId}` : descriptionId
                }
                aria-invalid={error ? "true" : undefined}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => {
                  setNextName(event.target.value)
                  setError(null)
                }}
              />
            </label>
            {error ? (
              <p
                id={errorId}
                className="mt-2 break-words text-xs text-destructive"
                role="alert"
              >
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
            <Button
              type="submit"
              disabled={
                submitting || !nextName.trim() || nextName.trim() === name
              }
            >
              {submitting ? (
                <>
                  <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                  Renaming…
                </>
              ) : (
                "Rename"
              )}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
