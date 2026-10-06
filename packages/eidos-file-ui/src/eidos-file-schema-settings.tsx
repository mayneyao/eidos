import { useId, useRef, useState } from "react"
import { Settings2 } from "lucide-react"
import { MobileLayoutChoice } from "./mobile-view-layout"
import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
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
  inlineMobile = false,
}: {
  schema: { type: "object"; properties: Record<string, Property> }
  fields: readonly EidosFileFieldInfo[]
  values: Record<string, unknown>
  disabled: boolean
  onUpdate: (values: Record<string, unknown>) => Promise<void>
  inlineMobile?: boolean
}) {
  const id = useId()
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const [error, setError] = useState("")
  async function update(key: string, value: unknown, propagate = false) {
    if (disabled || pending.current) return
    pending.current = true
    setSaving(true)
    setError("")
    try {
      await onUpdate({ ...values, [key]: value })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      if (propagate) throw cause
    } finally {
      pending.current = false
      setSaving(false)
    }
  }
  const form = (
    <div
      className={inlineMobile ? "eidos-mobile-plugin-settings" : "space-y-4"}
      aria-busy={saving}
    >
      {Object.entries(schema.properties).map(([key, property]) => {
        const value = values[key] ?? property.default
        const inputId = `${id}-${key}`
        const blocked = disabled || saving
        const options =
          property.type === "string"
            ? property["x-field"]
              ? [
                  {
                    value: "",
                    label: inlineMobile ? "选择字段…" : "Choose field…",
                  },
                  ...fields
                    .filter((field) => field.type !== "row-id")
                    .map((field) => ({ value: field.id, label: field.name })),
                ]
              : property.enum?.map((value) => ({ value, label: value }))
            : undefined
        if (inlineMobile) {
          return (
            <div key={key} className="mobile-plugin-setting">
              {options ? (
                <MobileLayoutChoice
                  label={property.title}
                  value={String(value)}
                  options={
                    options.some((option) => option.value === value)
                      ? options
                      : [
                          { value: String(value), label: "字段不可用" },
                          ...options,
                        ]
                  }
                  disabled={blocked}
                  onChange={(value) => update(key, value, true)}
                />
              ) : property.type === "boolean" ? (
                <label className="mobile-setting-row" htmlFor={inputId}>
                  <span>{property.title}</span>
                  <Switch
                    id={inputId}
                    aria-label={property.title}
                    checked={Boolean(value)}
                    disabled={blocked}
                    onCheckedChange={(value) => void update(key, value)}
                  />
                </label>
              ) : (
                <label className="mobile-setting-row" htmlFor={inputId}>
                  <span>{property.title}</span>
                  <Input
                    key={String(value)}
                    id={inputId}
                    type={property.type === "number" ? "number" : "text"}
                    inputMode={property.type === "number" ? "decimal" : "text"}
                    defaultValue={String(value)}
                    disabled={blocked}
                    min={
                      property.type === "number" ? property.minimum : undefined
                    }
                    max={
                      property.type === "number" ? property.maximum : undefined
                    }
                    step="any"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur()
                    }}
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
                </label>
              )}
              {property.description && (
                <p className="mobile-setting-note">{property.description}</p>
              )}
            </div>
          )
        }
        return (
          <div
            key={key}
            className="space-y-1.5"
            data-setting-kind={property.type}
          >
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
                  <option value={String(value)}>
                    {inlineMobile ? "字段不可用" : "Unavailable field"}
                  </option>
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
                min={property.type === "number" ? property.minimum : undefined}
                max={property.type === "number" ? property.maximum : undefined}
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
    </div>
  )
  if (inlineMobile) return form
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
      >
        <div className="text-sm font-medium">View settings</div>
        {form}
      </PopoverContent>
    </Popover>
  )
}
