import { BinaryOperator, CompareOperator } from "@/packages/core/fields/const"
import type { IField } from "@/packages/core/types/IField"
import { CopyPlusIcon, PlusIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

import "./filter.css"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { CommonMenuItem } from "@/components/common-menu-item"

import type {
  IFilterValue,
  IGroupFilterValue,
} from "../../../../../packages/core/types/IViewFilter"
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
  const { t } = useTranslation()

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
        className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      >
        <PlusIcon className="h-2.5 w-2.5"></PlusIcon>
        {t("table.view.addFilter")}
      </div>
    ) : (
      <Popover>
        <PopoverTrigger className="flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground">
          <PlusIcon className="h-2.5 w-2.5"></PlusIcon>
          {t("table.view.addFilter")}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0.5" align="start">
          <div
            onClick={handleAddFilter}
            className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-xs hover:bg-muted/50"
          >
            <PlusIcon className="h-2.5 w-2.5"></PlusIcon>
            {t("table.view.addFilter")}
          </div>
          {depth < 2 && (
            <div
              onClick={handleAddGroupFilter}
              className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-xs hover:bg-muted/50"
            >
              <CopyPlusIcon className="h-2.5 w-2.5"></CopyPlusIcon>
              {t("table.view.addGroupFilter")}
            </div>
          )}
        </PopoverContent>
      </Popover>
    )
  if (!_value) {
    return (
      <div className="flex max-w-[600px] flex-col gap-1.5 border border-gray-200 p-1.5 dark:border-gray-700">
        <div
          className={cn({
            "sub-group-filter": depth > 0,
            "group-wrapper-root": depth === 0,
          })}
        ></div>
        <span className="select-none text-xs text-muted-foreground">
          {t("table.view.noFilterRule")}
        </span>
        {AddFilterComponent}
        <hr />
        <CommonMenuItem className="pl-3 text-xs" onClick={clearFilter}>
          {t("table.view.deleteFilter")}
        </CommonMenuItem>
      </div>
    )
  }
  if (
    [BinaryOperator.And, BinaryOperator.Or].includes(_value.operator as any)
  ) {
    if (depth === 0) {
      return (
        <div className="flex min-w-[400px] max-w-[900px] flex-col gap-1.5 border border-gray-200 p-1.5 dark:border-gray-700">
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
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilter}
            className="h-6 text-xs"
          >
            {t("table.view.deleteFilter")}
          </Button>
        </div>
      )
    }
    return (
      <div className="sub-group-filter flex flex-col gap-1.5 border border-gray-200 dark:border-gray-700">
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
