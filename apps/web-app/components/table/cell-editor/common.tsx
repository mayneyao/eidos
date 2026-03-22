import { SelectField, type SelectOption } from "@/packages/core/fields/select"

export const EmptyValue = () => {
  return (
    <div className="flex h-full w-full items-center">
      <span className="text-muted-foreground italic">Empty</span>
    </div>
  )
}

export const SelectOptionItem = ({
  option,
  theme,
}: {
  option: SelectOption
  theme?: string
}) => {
  return (
    <span
      className="truncate rounded-xs px-2 text-sm"
      style={{
        background: SelectField.getColorValue(
          option?.color || SelectField.defaultColor,
          theme as any
        ),
      }}
    >
      {option.name}
    </span>
  )
}
