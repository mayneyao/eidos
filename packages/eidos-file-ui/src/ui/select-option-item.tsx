import { useEidosFileUI } from "../context"
import { eidosFileOptionColor } from "../eidos-file-field-properties"
import type { EidosFileGridSelectOption as SelectOption } from "../eidos-file-grid-adapter"

export function SelectOptionItem({
  option,
  theme,
}: {
  option: SelectOption
  theme?: "light" | "dark" | "system"
}) {
  const { themeName } = useEidosFileUI()
  return (
    <span
      className="inline-flex max-w-[150px] items-center truncate rounded px-1.5 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: eidosFileOptionColor(
          option.color,
          theme === "dark" || (!theme && themeName === "dark")
            ? "dark"
            : "light"
        ),
      }}
    >
      {option.name}
    </span>
  )
}
