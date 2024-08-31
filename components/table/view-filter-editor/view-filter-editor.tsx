import { CopyPlusIcon, PlusIcon } from "lucide-react"

import { BinaryOperator, CompareOperator } from "@/lib/fields/const"
import { IField } from "@/lib/store/interface"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

import "./filter.css"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { CommonMenuItem } from "@/components/common-menu-item"

import { IFilterValue, IGroupFilterValue } from "./interface"
import { ViewFilterGroupEditor } from "./view-filter-group-editor"
import { ViewFilterItemEditor } from "./view-filter-item-editor"

interface IViewFilterEditorProps {
  value: IFilterValue | IGroupFilterValue
  onChange: (value: IFilterValue | IGroupFilterValue) => void
  fields: IField[]
  handleClearFilter?: () => void
  depth?: number
}

export const ViewFilterEditor = ({
  value: _value,
  onChange,
  fields,
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
              operands: [fields[0].table_column_name, null],
            },
          ],
        }
      : {
          operator: BinaryOperator.And,
          operands: [
            {
              operator: CompareOperator.IsNotEmpty,
              operands: [fields[0].table_column_name, null],
            },
          ],
        }
    onChange(newValue as any)
  }

  const handleAddGroupFilter = () => {
    const newValue = _value
      ? {
          operator: _value.operator,
          operands: [
            ...(_value as IGroupFilterValue).operands,
            {
              operator: BinaryOperator.And,
              operands: [
                {
                  operator: CompareOperator.IsNotEmpty,
                  operands: [fields[0].table_column_name, null],
                },
              ],
            },
          ],
        }
      : {
          operator: BinaryOperator.And,
          operands: [
            {
              operator: CompareOperator.IsNotEmpty,
              operands: [fields[0].table_column_name, null],
            },
          ],
        }
    onChange(newValue as any)
  }
  const clearFilter = () => {
    handleClearFilter && handleClearFilter()
  }
  const AddFilterComponent =
    depth === 2 ? (
      <div
        onClick={handleAddFilter}
        className="flex cursor-pointer items-center gap-2 rounded-sm p-2 hover:bg-secondary"
      >
        <PlusIcon className="h-4 w-4"></PlusIcon>
        add filter
      </div>
    ) : (
      <Popover>
        <PopoverTrigger className="flex w-full items-center gap-2 rounded-sm p-2 hover:bg-secondary">
          <PlusIcon className="h-4 w-4"></PlusIcon>add filter
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div
            onClick={handleAddFilter}
            className="flex cursor-pointer items-center gap-2 p-2 hover:bg-secondary"
          >
            <PlusIcon className="h-4 w-4 opacity-70"></PlusIcon>
            add filter
          </div>
          {depth < 2 && (
            <div
              onClick={handleAddGroupFilter}
              className="flex cursor-pointer items-center gap-2 p-2 hover:bg-secondary"
            >
              <CopyPlusIcon className="h-4 w-4 opacity-70"></CopyPlusIcon>
              add group filter
            </div>
          )}
        </PopoverContent>
      </Popover>
    )
  if (!_value) {
    return (
      <div className="flex max-w-[600px] flex-col gap-2 border border-gray-200 p-2 dark:border-gray-700">
        <div
          className={cn({
            "sub-group-filter": depth > 0,
            "group-wrapper-root": depth === 0,
          })}
        ></div>
        <span className="select-none text-sm">
          There is no filter rule, add one
        </span>
        {AddFilterComponent}
        <hr />
        <CommonMenuItem className="pl-4" onClick={clearFilter}>
          delete filter
        </CommonMenuItem>
      </div>
    )
  }
  if (
    [BinaryOperator.And, BinaryOperator.Or].includes(_value.operator as any)
  ) {
    if (depth === 0) {
      return (
        <div className="flex min-w-[400px] max-w-[900px] flex-col gap-2 border border-gray-200 p-2 dark:border-gray-700">
          <div
            className={cn("items-start", {
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
          {AddFilterComponent}
          <hr />
          <Button variant="ghost" onClick={clearFilter}>
            delete filter
          </Button>
        </div>
      )
    }
    return (
      <div className="sub-group-filter flex flex-col gap-2 border border-gray-200 dark:border-gray-700">
        <div className="group-wrapper-root items-baseline">
          <ViewFilterGroupEditor
            value={_value as IGroupFilterValue}
            fields={fields}
            depth={depth + 1}
            onChange={onChange}
            parentOperator={_value.operator as BinaryOperator}
          />
        </div>
        {AddFilterComponent}
      </div>
    )
  }
  return (
    <ViewFilterItemEditor
      value={_value as IFilterValue}
      fields={fields}
      onChange={onChange}
    ></ViewFilterItemEditor>
  )
}
