import { useEffect, useId, useRef, useState } from "react"

import { useEidosFileUI } from "./context"
import { cn } from "./lib/cn"
import { Input } from "./ui/primitives"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/primitives"
import { Switch } from "./ui/primitives"

import {
  EIDOS_FILE_OPTION_COLORS,
  type EidosFileNumberProperty,
} from "./eidos-file-field-properties"

export function EidosFileNumberPropertiesEditor({
  property: sourceProperty,
  disabled,
  onChange,
  className,
}: {
  property: EidosFileNumberProperty
  disabled: boolean
  onChange: (property: EidosFileNumberProperty) => Promise<void> | void
  className?: string
}) {
  const { translate: t } = useEidosFileUI()
  const [property, setProperty] = useState(sourceProperty)
  const propertyRef = useRef(sourceProperty)
  const [divideBy, setDivideBy] = useState(String(sourceProperty.divideBy))
  const skipDivideByCommitRef = useRef(false)
  const divideById = useId()

  useEffect(() => {
    propertyRef.current = sourceProperty
    setProperty(sourceProperty)
    setDivideBy(String(sourceProperty.divideBy))
  }, [sourceProperty])

  const update = (changes: Partial<EidosFileNumberProperty>) => {
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
    if (skipDivideByCommitRef.current) {
      skipDivideByCommitRef.current = false
      return
    }
    const value = Number(divideBy)
    if (Number.isFinite(value) && value > 0 && value !== property.divideBy) {
      update({ divideBy: value })
    } else {
      setDivideBy(String(property.divideBy))
    }
  }

  return (
    <section className={cn("grid gap-3 border-t pt-3", className)}>
      <h3 className="text-xs font-medium">{t("Number display")}</h3>
      <label className="grid gap-1.5 text-xs">
        <span className="font-medium">{t("Format")}</span>
        <Select
          value={property.format}
          disabled={disabled}
          onValueChange={(format) =>
            update({ format: format as EidosFileNumberProperty["format"] })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="number">{t("Number")}</SelectItem>
            <SelectItem value="percent">{t("Percent")}</SelectItem>
            <SelectItem value="currency">{t("Currency")}</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <div className="grid gap-1.5">
        <span className="text-xs font-medium">{t("Show as")}</span>
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
              {t(showAs)}
            </button>
          ))}
        </div>
      </div>
      {property.showAs === "bar" ? (
        <>
          <label className="grid gap-1.5 text-xs" htmlFor={divideById}>
            <span className="font-medium">{t("Bar maximum")}</span>
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
                  skipDivideByCommitRef.current = true
                  setDivideBy(String(property.divideBy))
                  event.currentTarget.blur()
                }
              }}
            />
          </label>
          <label className="grid gap-1.5 text-xs">
            <span className="font-medium">{t("Bar color")}</span>
            <Select
              value={property.color}
              disabled={disabled}
              onValueChange={(color) => update({ color })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EIDOS_FILE_OPTION_COLORS.map((color) => (
                  <SelectItem key={color.name} value={color.name}>
                    <span className="capitalize">{t(color.name)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium">{t("Show number")}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {t("Keep the value visible beside the bar.")}
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
