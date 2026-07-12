import { useEffect, useId, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"

interface BaseRenameDialogProps {
  kind: "table" | "field"
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onRename: (name: string) => Promise<void> | void
}

export function BaseRenameDialog({
  kind,
  name,
  open,
  onOpenChange,
  onRename,
}: BaseRenameDialogProps) {
  const [nextName, setNextName] = useState(name)
  const nameId = useId()

  useEffect(() => {
    if (open) setNextName(name)
  }, [name, open])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = nextName.trim()
    if (!trimmed || trimmed === name) return
    void Promise.resolve(onRename(trimmed)).catch(() => undefined)
    onOpenChange(false)
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <span className="pointer-events-none absolute right-2 top-10 h-px w-px" />
      </PopoverAnchor>
      <PopoverContent align="end" side="bottom" className="w-80 p-0">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Rename {kind}</h2>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            This changes the display name inside the Base file.
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
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setNextName(event.target.value)}
              />
            </label>
          </div>
          <div className="flex items-center justify-end gap-2 border-t px-4 py-2.5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!nextName.trim() || nextName.trim() === name}
            >
              Rename
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
