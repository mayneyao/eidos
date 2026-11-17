import { useEidosFileUI } from "./context"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/primitives"

export function EidosFileTemporalDefaultEditor({
  type,
  value,
  disabled,
  onChange,
}: {
  type: "date" | "datetime"
  value: "now" | null
  disabled: boolean
  onChange: (value: "now" | null) => void
}) {
  const { translate: t } = useEidosFileUI()
  return (
    <label className="grid gap-1.5 text-xs">
      <span className="font-medium">{t("Default value")}</span>
      <Select
        value={value ?? "none"}
        disabled={disabled}
        onValueChange={(next) => onChange(next === "now" ? "now" : null)}
      >
        <SelectTrigger className="h-8 text-xs" aria-label={t("Default value")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t("No default")}</SelectItem>
          <SelectItem value="now">
            {t(type === "date" ? "Current date" : "Current time")}
          </SelectItem>
        </SelectContent>
      </Select>
      <span className="text-[11px] leading-4 text-muted-foreground">
        {t("Filled when a record is created. You can edit or clear it.")}
      </span>
    </label>
  )
}
