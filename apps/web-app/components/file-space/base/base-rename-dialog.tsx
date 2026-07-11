import { useEffect, useId, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-0 p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="text-base">Rename {kind}</DialogTitle>
          <DialogDescription className="text-xs leading-5">
            This changes the display name inside the Base file.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <div className="px-5 py-4">
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
          <DialogFooter className="border-t px-5 py-3">
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
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
