import { Trash2Icon } from "lucide-react"

import { BinaryOperator } from "@/lib/fields/const"
import { isLogicOperator } from "@/lib/sqlite/sql-filter-parser"
import { IField } from "@/lib/store/interface"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { IFilterValue, IGroupFilterValue } from "./interface"
import { ViewFilterEditor } from "./view-filter-editor"

interface IViewFilterGroupEditorProps {
  value: IGroupFilterValue
  onChange: (value: IGroupFilterValue) => void
  fields: IField[]
  depth?: number
  parentOperator: BinaryOperator
}

export const ViewFilterGroupEditor = ({
  value: _value,
  onChange,
  fields,
  depth = 0,
  parentOperator,
}: IViewFilterGroupEditorProps) => {
  const handleValueChange = (value: IGroupFilterValue, index: number) => {
    const newValue = { ..._value, operands: [..._value.operands] }
    newValue.operands[index] = value
    if (isLogicOperator(value.operator) && value.operands.length === 0) {
      // delete this group
      console.log("this group is empty, delete it")
      newValue.operands.splice(index, 1)
    }
    onChange(newValue)
  }

  const handleOperatorChange = (value: BinaryOperator) => {
    onChange({ ..._value, operator: value })
  }
  const handleDelete = (index: number) => {
    const newValue = { ..._value, operands: [..._value.operands] }
    newValue.operands.splice(index, 1)
    onChange(newValue)
  }
  return (
    <>
      {_value?.operands.map((operand, index) => {
        return (
          <>
            {index === 0 && <div>Where</div>}
            {index === 1 && (
              <OpSelector
                value={parentOperator}
                onChange={handleOperatorChange}
              />
            )}
            {index > 1 && (
              <div className="text-center text-sm">{parentOperator}</div>
            )}
            <ViewFilterEditor
              value={operand as IFilterValue}
              fields={fields}
              onChange={(value: any) => {
                handleValueChange(value, index)
              }}
              depth={depth}
            ></ViewFilterEditor>
            <Trash2Icon
              onClick={() => handleDelete(index)}
              className="h-4 w-4 cursor-pointer"
            ></Trash2Icon>
          </>
        )
      })}
    </>
  )
}

export const OpSelector = ({
  value,
  onChange,
}: {
  value: BinaryOperator
  onChange: (value: BinaryOperator) => void
}) => {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Field" />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value={BinaryOperator.And} hideCheckIcon className="pl-2">
          <span className="flex items-center gap-2 text-sm">AND</span>
        </SelectItem>
        <SelectItem value={BinaryOperator.Or} hideCheckIcon className="pl-2">
          <span className="flex items-center gap-2 text-sm">OR</span>
        </SelectItem>
      </SelectContent>
    </Select>
  )
}
