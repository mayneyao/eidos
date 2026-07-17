import { useBaseUI } from "../context"
import {
  baseOptionColor,
  type BaseSelectOption as SelectOption,
} from "../base-field-properties"

export function SelectOptionItem({
  option,
  theme,
}: {
  option: SelectOption
  theme?: "light" | "dark" | "system"
}) {
  const { themeName } = useBaseUI()
  return (
    <span
      className="inline-flex max-w-[150px] items-center truncate rounded px-1.5 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: baseOptionColor(
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
