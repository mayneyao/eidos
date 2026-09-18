import { useId, useRef, useState } from "react"
import { Settings2 } from "lucide-react"
import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/primitives"

type Property = { title: string; description?: string; "x-field"?: true } & (
  | { type: "string"; default: string; enum?: string[] }
  | { type: "number"; default: number; minimum?: number; maximum?: number }
  | { type: "boolean"; default: boolean }
)

/** Small declarative form shared by hosts; it has no plugin execution authority. */
export function EidosFileSchemaSettings({
  schema,
  fields,
  values,
  disabled,
  onUpdate,
}: {
  schema: { type: "object"; properties: Record<string, Property> }
  fields: readonly EidosFileFieldInfo[]
  values: Record<string, unknown>
  disabled: boolean
  onUpdate: (values: Record<string, unknown>) => Promise<void>
}) {
  const id = useId()
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const [error, setError] = useState("")
  async function update(key: string, value: unknown) {
    if (disabled || pending.current) return
    pending.current = true
    setSaving(true)
    setError("")
    try {
      await onUpdate({ ...values, [key]: value })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      pending.current = false
      setSaving(false)
    }
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="View settings">
          <Settings2 className="size-4" />
          <span>View settings</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 max-h-[70vh] overflow-y-auto space-y-4"
        aria-busy={saving}
      >
        <div className="text-sm font-medium">View settings</div>
        {Object.entries(schema.properties).map(([key, property]) => {
          const value = values[key] ?? property.default
          const inputId = `${id}-${key}`
          const blocked = disabled
          const options =
            property.type === "string"
              ? property["x-field"]
                ? [
                    { value: "", label: "Choose field…" },
                    ...fields
                      .filter((field) => field.type !== "row-id")
                      .map((field) => ({ value: field.id, label: field.name })),
                  ]
                : property.enum?.map((value) => ({ value, label: value }))
              : undefined
          return (
            <div key={key} className="space-y-1.5">
              <label htmlFor={inputId} className="text-sm font-medium">
                {property.title}
              </label>
              {options ? (
                <select
                  id={inputId}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                  disabled={blocked}
                  value={String(value)}
                  onChange={(event) => void update(key, event.target.value)}
                >
                  {!options.some((option) => option.value === value) && (
                    <option value={String(value)}>Unavailable field</option>
                  )}
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : property.type === "boolean" ? (
                <input
                  id={inputId}
                  type="checkbox"
                  className="ml-2"
                  disabled={blocked}
                  checked={Boolean(value)}
                  onChange={(event) => void update(key, event.target.checked)}
                />
              ) : (
                <Input
                  key={String(value)}
                  id={inputId}
                  type={property.type === "number" ? "number" : "text"}
                  defaultValue={String(value)}
                  disabled={blocked}
                  min={
                    property.type === "number" ? property.minimum : undefined
                  }
                  max={
                    property.type === "number" ? property.maximum : undefined
                  }
                  step="any"
                  onBlur={(event) => {
                    if (
                      event.target.checkValidity() &&
                      event.target.value !== String(value)
                    )
                      void update(
                        key,
                        property.type === "number"
                          ? Number(event.target.value)
                          : event.target.value
                      )
                  }}
                />
              )}
              {property.description && (
                <p className="text-xs text-muted-foreground">
                  {property.description}
                </p>
              )}
            </div>
          )
        })}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
