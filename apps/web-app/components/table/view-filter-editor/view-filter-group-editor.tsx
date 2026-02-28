import React from "react"
import { Trash2Icon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { BinaryOperator } from "@/packages/core/fields/const"
import { isLogicOperator } from "@/packages/core/sqlite/sql-filter-parser"
import type { IField } from "@/packages/core/types/IField"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import type {
  IFilterValue,
  IGroupFilterValue,
} from "../../../../../packages/core/types/IViewFilter"
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
  const { t } = useTranslation()
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
          <React.Fragment key={index}>
            {index === 0 && (
              <div className="text-xs text-muted-foreground">
                {t("table.view.where")}
              </div>
            )}
            {index === 1 && (
              <OpSelector
                value={parentOperator}
                onChange={handleOperatorChange}
              />
            )}
            {index > 1 && (
              <div className="text-center text-xs text-muted-foreground">
                {parentOperator}
              </div>
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
              className="m-0.5 h-3 w-3 cursor-pointer opacity-70 hover:opacity-100"
            ></Trash2Icon>
          </React.Fragment>
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
  const { t } = useTranslation()
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Field" />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value={BinaryOperator.And} className="pl-1.5">
          <span className="flex items-center gap-1.5 text-xs">
            {t("table.view.and")}
          </span>
        </SelectItem>
        <SelectItem value={BinaryOperator.Or} className="pl-1.5">
          <span className="flex items-center gap-1.5 text-xs">
            {t("table.view.or")}
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  )
}
