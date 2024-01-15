import { allFieldTypesMap } from "@/lib/fields"
import { CompareOperator } from "@/lib/fields/const"
import { IField } from "@/lib/store/interface"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface IFieldCompareSelectorProps {
  field?: IField
  value: CompareOperator
  onChange: (value: CompareOperator) => void
}

export const FieldCompareSelector = ({
  field,
  value,
  onChange,
}: IFieldCompareSelectorProps) => {
  if (!field) {
    return null
  }
  const fieldCls = allFieldTypesMap[field?.type]
  const fieldInstance = new fieldCls(field)
  const fieldCompareOperators = fieldInstance.compareOperators
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Field" />
      </SelectTrigger>
      <SelectContent position="popper">
        {fieldCompareOperators.map((op) => {
          return (
            <SelectItem value={op} key={op} hidecheckicon className="pl-2">
              <span className="flex items-center gap-2">{op}</span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
