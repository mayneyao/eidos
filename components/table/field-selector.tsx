import { IField } from "@/lib/store/interface"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { makeHeaderIcons } from "@/components/grid/fields/header-icons"

const icons = makeHeaderIcons(18)

interface IFieldSelectorProps {
  fields: IField[]
  value?: string
  onChange: (value: string) => void
}

export const FieldSelector = ({
  fields,
  value,
  onChange,
}: IFieldSelectorProps) => {
  if (!value) return null
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Field" />
      </SelectTrigger>
      <SelectContent position="popper">
        {fields.map((column) => {
          const iconSvgString = icons[column.type]({
            bgColor: "#aaa",
            fgColor: "currentColor",
          })
          return (
            <SelectItem
              value={column.table_column_name}
              key={column.table_column_name}
              hidecheckicon
              className="pl-2"
            >
              <span className="flex items-center gap-2">
                <span
                  dangerouslySetInnerHTML={{
                    __html: iconSvgString,
                  }}
                ></span>
                {column.name}
              </span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
