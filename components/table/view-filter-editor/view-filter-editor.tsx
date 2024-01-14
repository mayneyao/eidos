import { BinaryOperator, CompareOperator } from "@/lib/fields/const"
import { IField } from "@/lib/store/interface"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

import "./filter.css"
import { IFilterValue, IGroupFilterValue } from "./interface"
import { ViewFilterGroupEditor } from "./view-filter-group-editor"
import { ViewFilterItemEditor } from "./view-filter-item-editor"

interface IViewFilterEditorProps {
  value: IFilterValue | IGroupFilterValue
  onChange: (value: IFilterValue | IGroupFilterValue) => void
  fields: IField[]
  onDelete?: () => void
  handleClearFilter?: () => void
  depth?: number
}

export const ViewFilterEditor = ({
  value: _value,
  onChange,
  fields,
  onDelete,
  handleClearFilter,
  depth = 0,
}: IViewFilterEditorProps) => {
  const handleAddFilter = () => {
    const newValue = _value
      ? {
          operator: _value.operator,
          operands: [
            ...(_value as IGroupFilterValue).operands,
            {
              operator: CompareOperator.IsNotEmpty,
              operands: [fields[0].name, null],
            },
          ],
        }
      : {
          operator: BinaryOperator.And,
          operands: [
            {
              operator: CompareOperator.IsNotEmpty,
              operands: [fields[0].name, null],
            },
          ],
        }
    onChange(newValue as any)
  }
  const clearFilter = () => {
    handleClearFilter && handleClearFilter()
  }
  if (!_value) {
    return (
      <div className="flex max-w-[600px] flex-col gap-2 border border-gray-200 p-2">
        <div
          className={cn({
            "sub-group-filter": depth > 0,
            "group-wrapper-root": depth === 0,
          })}
        ></div>
        <Button variant="outline" onClick={handleAddFilter}>
          add filter
        </Button>
        <Button variant="outline" onClick={clearFilter}>
          delete filter
        </Button>
      </div>
    )
  }
  if (
    [BinaryOperator.And, BinaryOperator.Or].includes(_value.operator as any)
  ) {
    if (depth === 0) {
      return (
        <div className="flex min-w-[400px] max-w-[600px] flex-col gap-2 border border-gray-200 p-2">
          <div
            className={cn("items-center", {
              "sub-group-filter": depth > 0,
              "group-wrapper-root": depth === 0,
            })}
          >
            <ViewFilterGroupEditor
              value={_value as IGroupFilterValue}
              fields={fields}
              depth={depth + 1}
              onChange={onChange}
              parentOperator={_value.operator as BinaryOperator}
            />
          </div>
          <Button variant="outline" onClick={handleAddFilter}>
            add filter
          </Button>
          <Button variant="outline" onClick={clearFilter}>
            delete filter
          </Button>
        </div>
      )
    }
    return (
      <div className="sub-group-filter flex flex-col gap-2 border border-gray-200">
        <div className="group-wrapper-root">
          <ViewFilterGroupEditor
            value={_value as IGroupFilterValue}
            fields={fields}
            depth={depth + 1}
            onChange={() => {}}
            parentOperator={_value.operator as BinaryOperator}
          />
        </div>
        <Button variant="outline" onClick={handleAddFilter}>
          add filter
        </Button>
      </div>
    )
  }
  return (
    <ViewFilterItemEditor
      value={_value as IFilterValue}
      fields={fields}
      onChange={onChange}
      onDelete={onDelete}
    ></ViewFilterItemEditor>
  )
}
