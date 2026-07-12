import { useEffect, useId, useMemo, useState, type FormEvent } from "react"
import type { BaseFieldInfo } from "@eidos.space/base"

import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"

interface BaseFieldOption {
  id: string
  name: string
  color: string
}

function fieldOptions(field: BaseFieldInfo): BaseFieldOption[] {
  const options = field.property?.options
  if (!Array.isArray(options)) return []
  return options.flatMap((option) => {
    if (
      typeof option !== "object" ||
      option === null ||
      !("id" in option) ||
      !("name" in option) ||
      typeof option.id !== "string" ||
      typeof option.name !== "string"
    ) {
      return []
    }
    return [
      {
        id: option.id,
        name: option.name,
        color:
          "color" in option && typeof option.color === "string"
            ? option.color
            : "default",
      },
    ]
  })
}

function optionId(name: string, index: number): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return (
    "option_" +
    Date.now().toString(36) +
    "_" +
    (index + 1) +
    (slug ? "_" + slug : "")
  )
}

interface BaseFieldOptionsDialogProps {
  field: BaseFieldInfo | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (property: Record<string, unknown>) => Promise<void> | void
}

export function BaseFieldOptionsDialog({
  field,
  open,
  onOpenChange,
  onSave,
}: BaseFieldOptionsDialogProps) {
  const existing = useMemo(() => (field ? fieldOptions(field) : []), [field])
  const initialValue = existing.map((option) => option.name).join(", ")
  const [value, setValue] = useState(initialValue)
  const optionsId = useId()

  useEffect(() => {
    if (open) setValue(initialValue)
  }, [initialValue, open])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!field) return
    const names = Array.from(
      new Set(
        value
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean)
      )
    )
    const existingByName = new Map(
      existing.map((option) => [option.name, option])
    )
    const options = names.map(
      (name, index) =>
        existingByName.get(name) ?? {
          id: optionId(name, index),
          name,
          color: "default",
        }
    )
    void Promise.resolve(onSave({ ...(field.property ?? {}), options })).catch(
      () => undefined
    )
    onOpenChange(false)
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <span className="pointer-events-none absolute right-2 top-10 h-px w-px" />
      </PopoverAnchor>
      <PopoverContent align="end" side="bottom" className="w-80 p-0">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Edit options</h2>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            Update the choices available in {field?.name ?? "this field"}.
          </p>
        </div>
        <form onSubmit={submit}>
          <div className="px-4 py-3">
            <label
              className="grid gap-1.5 text-xs font-medium"
              htmlFor={optionsId}
            >
              Options
              <Input
                id={optionsId}
                value={value}
                autoFocus
                placeholder="Todo, In progress, Done"
                onChange={(event) => setValue(event.target.value)}
              />
              <span className="font-normal leading-4 text-muted-foreground">
                Separate option names with commas. Existing option IDs are
                preserved when names stay the same.
              </span>
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
            <Button type="submit" disabled={value === initialValue}>
              Save
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
