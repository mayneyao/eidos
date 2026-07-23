import { useEidosFileUI } from "../context"
import { eidosFileOptionColor } from "../eidos-file-field-properties"
import { cn } from "../lib/cn"

interface SelectOptionVisual {
  id?: string
  name: string
  color: string
}

export function SelectOptionItem({
  option,
  theme,
  className,
}: {
  option: SelectOptionVisual
  theme?: "light" | "dark" | "system"
  className?: string
}) {
  const { themeName } = useEidosFileUI()
  return (
    <span
      className={cn(
        "inline-flex max-w-[150px] items-center truncate rounded px-1.5 py-0.5 text-xs font-medium",
        className
      )}
      data-eidos-file-option-color={option.color}
      title={option.name}
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
