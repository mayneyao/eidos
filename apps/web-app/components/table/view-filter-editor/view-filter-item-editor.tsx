import { CompareOperator } from "@/packages/core/fields/const"
import type { IField } from "@/packages/core/types/IField"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useUiColumns } from "@/apps/web-app/hooks/use-ui-columns"

import { CellEditor } from "../cell-editor"
import { FieldCompareSelector } from "../fields/field-compare-selector"
import { FieldSelector } from "../fields/field-selector"
import type { IFilterValue } from "../../../../../packages/core/types/IViewFilter"

interface IViewFilterItemEditorProps {
  value?: IFilterValue
  onChange: (value: IFilterValue) => void
  onDelete?: () => void
  fields: IField[]
}

export const ViewFilterItemEditor = ({
  value,
  onChange,
  onDelete,
  fields,
}: IViewFilterItemEditorProps) => {
  const { database, tableName } = useCurrentPathInfo()
  const { rawIdNameMap, uiColumnMap, uiColumns } = useUiColumns(
    tableName!,
    database!
  )

  if (!value) {
    return (
      <>
        <FieldSelector
          fields={uiColumns}
          value={uiColumns[0]?.table_column_name}
          onChange={() => {}}
        />
        <FieldCompareSelector
          field={uiColumns[0]}
          value={CompareOperator.IsEmpty}
          onChange={() => {}}
        />
        <div></div>
      </>
    )
  }
  const handleFieldChange = (fieldName: string) => {
    onChange({
      ...value,
      operands: [fieldName, value.operands[1]],
    })
  }
  const handleCompareOpChange = (op: CompareOperator) => {
    onChange({
      ...value,
      operator: op,
    })
  }
  const handleValueChange = (_value: string) => {
    onChange({
      ...value,
      operands: [value.operands[0], _value],
    })
  }

  const fieldRawName = value.operands[0]
  const fieldName = rawIdNameMap.get(fieldRawName)
  const field = uiColumnMap.get(fieldName!)
  return (
    <>
      <FieldSelector
        fields={uiColumns}
        value={field?.table_column_name}
        onChange={handleFieldChange}
      />
      <FieldCompareSelector
        field={field}
        value={value.operator}
        onChange={handleCompareOpChange}
      />
      {value.operator === CompareOperator.IsEmpty ||
      value.operator === CompareOperator.IsNotEmpty ? (
        <div />
      ) : (
        <CellEditor
          field={field!}
          value={value.operands[1] as string}
          onChange={handleValueChange}
          className="max-w-[200px]"
          editorMode
        />
      )}
    </>
  )
}
