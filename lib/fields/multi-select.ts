import { MultiSelectCell } from "@/components/table/views/grid/cells/multi-select-cell"

import { BaseField } from "./base"
import { CompareOperator, FieldType, GridCellKind } from "./const"
import { SelectField, SelectProperty } from "./select"

type MultiSelectProperty = SelectProperty

export class MultiSelectField extends BaseField<
  MultiSelectCell,
  MultiSelectProperty,
  string
> {
  static type = FieldType.MultiSelect

  get compareOperators() {
    return [
      CompareOperator.Contains,
      CompareOperator.NotContains,
      CompareOperator.IsEmpty,
      CompareOperator.IsNotEmpty,
    ]
  }

  get type() {
    return MultiSelectField.type
  }

  get options() {
    return this.column.property?.options ?? []
  }

  // TODO: refactor multi-select and select to use the same code
  addOption(name: string) {
    const options = this.column.property?.options ?? []
    const nextColorName = SelectField.getNextAvailableColor(options)
    const newOptions = [
      { id: name, name, color: nextColorName },
      ...options,
    ]
    this.column.property.options = newOptions
    return newOptions
  }

  rawData2JSON(rawData: string | null): string[] {
    const options = this.column.property?.options ?? []
    const ids = rawData ? rawData.split(",").map(s => s.trim()) : []
    const names = ids.map((id) => {
      const option = options.find((i) => i.id === id)
      return option?.name || ""
    })
    return names
  }

  /**
   * in database we store the tags as a string, so we need to convert it to an array of strings
   * e.g. 
   * "tag1,tag2,tag3" => ["tag1", "tag2", "tag3"]
   * "tag1, tag2 with space" => ["tag1", "tag2 with space"]
   * @param rawData
   * @returns
   */
  getCellContent(rawData: string): MultiSelectCell {
    return {
      kind: GridCellKind.Custom,
      data: {
        kind: "multi-select-cell",
        allowedValues: this.column.property?.options ?? [],
        values: rawData ? rawData.split(",").map(s => s.trim()) : [],
      },
      copyData: rawData,
      allowOverlay: true,
    }
  }

  /**
   * @param text tag1,tag2
   * return tag1id,tag2id
   */
  // text2RawData(text: string) {
  //   // text can be a uuid or a name
  //   return text
  //     ?.split(/[\s,]+/)
  //     .map((value) => {
  //       const option = this.options.find((i) => i.id === value)
  //       if (option) {
  //         return option.id
  //       } else {
  //         // a new option name is entered, create a new option
  //         return
  //         const newOption = this.addOption(value)
  //         return newOption[0].id
  //       }
  //     })
  //     .filter(Boolean)
  //     .join(",")
  // }

  cellData2RawData(cell: MultiSelectCell) {
    if (cell.data.values == null) return { rawData: null }
    const allowedOptionIds = new Set(this.options.map((i) => i.id))
    const newValues = []
    let shouldUpdateColumnProperty = false
    for (const value of cell.data.values) {
      if (allowedOptionIds.has(value)) {
        newValues.push(value)
      } else {
        // a new option name is entered, create a new option
        const newOption = this.addOption(value)
        newValues.push(newOption[0].id)
        shouldUpdateColumnProperty = true
      }
    }
    return {
      rawData: newValues.join(",") || null,
      shouldUpdateColumnProperty,
    }
  }

  createFieldProperty() {
    return {
      options: [],
    }
  }
}
