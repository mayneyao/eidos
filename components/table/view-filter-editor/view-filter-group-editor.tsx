import { useState } from "react"
import { divide } from "lodash"
import { BinaryOperator } from "pgsql-ast-parser"

import { IField } from "@/lib/store/interface"

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
    onChange(newValue)
  }
  const handleDeleteItem = (index: number) => {
    const newValue = { ..._value, operands: [..._value.operands] }
    newValue.operands.splice(index, 1)
    onChange(newValue)
  }
  return (
    <>
      {_value?.operands.map((operand, index) => {
        return (
          <>
            {index === 0 ? <div>Where</div> : <div>{parentOperator}</div>}
            <ViewFilterEditor
              value={operand as IFilterValue}
              fields={fields}
              onChange={(value: any) => {
                handleValueChange(value, index)
              }}
              onDelete={() => {
                handleDeleteItem(index)
              }}
              depth={depth + 1}
            ></ViewFilterEditor>
          </>
        )
      })}
    </>
  )
}
