import { GridCellKind } from "@platools/glide-data-grid"

import { MultiSelectCell } from "@/components/grid/cells/multi-select-cell"

import { uuidv4 } from "../utils"
import { BaseField } from "./base"
import { SelectField, SelectProperty } from "./select"

type MultiSelectProperty = SelectProperty

export class MultiSelectField extends BaseField<
  MultiSelectCell,
  MultiSelectProperty,
  string
> {
  getDefaultFieldProperty(): MultiSelectProperty {
    throw new Error("Method not implemented.")
  }
  static type = "multi-select"

  get type() {
    return MultiSelectField.type
  }

  get options() {
    return this.column.property?.options ?? []
  }

  // TODO: refactor multi-select and select to use the same code
  addOption(name: string) {
    const options = this.column.property?.options ?? []
    const newOptions = [
      { id: uuidv4(), name, color: SelectField.defaultColor },
      ...options,
    ]
    this.column.property.options = newOptions
    return newOptions
  }

  /**
   * in database we store the tags as a string, so we need to convert it to an array of strings
   * e.g. "tag1,tag2,tag3" => ["tag1", "tag2", "tag3"]
   * @param rawData
   * @returns
   */
  getCellContent(rawData: string): MultiSelectCell {
    return {
      kind: GridCellKind.Custom,
      data: {
        kind: "multi-select-cell",
        allowedValues: this.column.property?.options ?? [],
        values: rawData ? rawData.split(/[\s,]+/) : [],
      },
      copyData: rawData,
      allowOverlay: true,
    }
  }
  cellData2RawData(cell: MultiSelectCell) {
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
      rawData: newValues.join(","),
      shouldUpdateColumnProperty,
    }
  }

  createFieldProperty() {
    return {
      options: [],
    }
  }
}
