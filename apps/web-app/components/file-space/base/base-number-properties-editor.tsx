import { useEffect, useId, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

import {
  BASE_OPTION_COLORS,
  type BaseNumberProperty,
} from "./base-field-properties"

export function BaseNumberPropertiesEditor({
  property: sourceProperty,
  disabled,
  onChange,
  className,
}: {
  property: BaseNumberProperty
  disabled: boolean
  onChange: (property: BaseNumberProperty) => Promise<void> | void
  className?: string
}) {
  const [property, setProperty] = useState(sourceProperty)
  const propertyRef = useRef(sourceProperty)
  const [divideBy, setDivideBy] = useState(String(sourceProperty.divideBy))
  const divideById = useId()

  useEffect(() => {
    propertyRef.current = sourceProperty
    setProperty(sourceProperty)
    setDivideBy(String(sourceProperty.divideBy))
  }, [sourceProperty])

  const update = (changes: Partial<BaseNumberProperty>) => {
    const previous = propertyRef.current
    const next = { ...previous, ...changes }
    propertyRef.current = next
    setProperty(next)
    void Promise.resolve()
      .then(() => onChange(next))
      .catch(() => {
        if (propertyRef.current !== next) return
        propertyRef.current = previous
        setProperty(previous)
        setDivideBy((current) =>
          current === String(next.divideBy)
            ? String(previous.divideBy)
            : current
        )
      })
  }

  const commitDivideBy = () => {
    const value = Number(divideBy)
    if (Number.isFinite(value) && value > 0 && value !== property.divideBy) {
      update({ divideBy: value })
    } else {
      setDivideBy(String(property.divideBy))
    }
  }

  return (
    <section className={cn("grid gap-3 border-t pt-3", className)}>
      <h3 className="text-xs font-medium">Number display</h3>
      <label className="grid gap-1.5 text-xs">
        <span className="font-medium">Format</span>
        <Select
          value={property.format}
          disabled={disabled}
          onValueChange={(format) =>
            update({ format: format as BaseNumberProperty["format"] })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="number">Number</SelectItem>
            <SelectItem value="percent">Percent</SelectItem>
            <SelectItem value="currency">Currency</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <div className="grid gap-1.5">
        <span className="text-xs font-medium">Show as</span>
        <div className="grid grid-cols-2 rounded-md border p-0.5">
          {(["number", "bar"] as const).map((showAs) => (
            <button
              key={showAs}
              type="button"
              className={cn(
                "h-7 rounded-[3px] text-xs capitalize focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                property.showAs === showAs
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              disabled={disabled}
              onClick={() => update({ showAs })}
            >
              {showAs}
            </button>
          ))}
        </div>
      </div>
      {property.showAs === "bar" ? (
        <>
          <label className="grid gap-1.5 text-xs" htmlFor={divideById}>
            <span className="font-medium">Bar maximum</span>
            <Input
              id={divideById}
              value={divideBy}
              disabled={disabled}
              inputMode="decimal"
              className="h-8 text-xs"
              onChange={(event) => setDivideBy(event.target.value)}
              onBlur={commitDivideBy}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur()
                if (event.key === "Escape") {
                  setDivideBy(String(property.divideBy))
                  event.currentTarget.blur()
                }
              }}
            />
          </label>
          <label className="grid gap-1.5 text-xs">
            <span className="font-medium">Bar color</span>
            <Select
              value={property.color}
              disabled={disabled}
              onValueChange={(color) => update({ color })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BASE_OPTION_COLORS.map((color) => (
                  <SelectItem key={color.name} value={color.name}>
                    <span className="capitalize">{color.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium">Show number</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Keep the value visible beside the bar.
              </p>
            </div>
            <Switch
              checked={property.showNumber}
              disabled={disabled}
              onCheckedChange={(showNumber) => update({ showNumber })}
            />
          </div>
        </>
      ) : null}
    </section>
  )
}
