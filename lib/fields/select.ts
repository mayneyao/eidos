import type { SelectCell } from "@/components/table/views/grid/cells/select-cell"

import { BaseField } from "./base"
import { CompareOperator, FieldType, GridCellKind } from "./const"
import { MultiSelectCell } from "@/components/table/views/grid/cells/multi-select-cell"
import { MultiSelectField } from "./multi-select"

export type SelectOption = {
  id: string
  name: string
  color: string
}

export type SelectProperty = {
  options: SelectOption[]
  defaultOption?: string
}

export class SelectField extends BaseField<SelectCell, SelectProperty> {
  static type = FieldType.Select

  static colors = {
    light: [
      {
        name: "default",
        value: "cccccc",
      },
      {
        name: "gray",
        value: "eeeeee",
      },
      {
        name: "brown",
        value: "e6c9a8",
      },
      {
        name: "pink",
        value: "ffd3e6",
      },
      {
        name: "red",
        value: "ffadad",
      },
      {
        name: "orange",
        value: "ffd6a5",
      },
      {
        name: "yellow",
        value: "fdffb6",
      },
      {
        name: "green",
        value: "caffbf",
      },
      {
        name: "cyan",
        value: "9bf6ff",
      },
      {
        name: "blue",
        value: "a0c4ff",
      },
      {
        name: "purple",
        value: "bdb2ff",
      },
    ],
    dark: [
      {
        name: "default",
        value: "333333",
      },
      {
        name: "gray",
        value: "555555",
      },
      {
        name: "brown",
        value: "5b4d3d",
      },
      {
        name: "pink",
        value: "9a3f5e",
      },
      {
        name: "red",
        value: "a63232",
      },
      {
        name: "orange",
        value: "ff9f4d",
      },
      {
        name: "yellow",
        value: "6e6620",
      },
      {
        name: "green",
        value: "23563b",
      },
      {
        name: "cyan",
        value: "1c5858",
      },
      {
        name: "blue",
        value: "3168a8",
      },
      {
        name: "purple",
        value: "6e33b4",
      },
    ],
  }

  static defaultColor = SelectField.colors.light[0].name

  static colorNameValueMap = {
    light: SelectField.colors.light.reduce((acc, color) => {
      acc[color.name] = color.value
      return acc
    }, {} as Record<string, string>),
    dark: SelectField.colors.dark.reduce((acc, color) => {
      acc[color.name] = color.value
      return acc
    }, {} as Record<string, string>),
  }

  /**
   * @param colorName name of the color. eg "default" | "gray"
   * @param theme theme of the color. eg "light" | "dark"
   * @returns hex value of the color. eg "#cccccc"
   */
  static getColorValue(colorName: string, theme: "light" | "dark" = "light") {
    return `#${SelectField.colorNameValueMap[theme][colorName]}`
  }

  get compareOperators() {
    return [
      CompareOperator.Equal,
      CompareOperator.NotEqual,
      CompareOperator.IsEmpty,
      CompareOperator.IsNotEmpty,
    ]
  }

  get options() {
    return this.column.property?.options ?? []
  }

  rawData2JSON(rawData: any): string {
    const options = this.column.property?.options ?? []
    const option = options.find((o) => o.id === rawData)
    return option?.name || ""
  }

  getCellContent(rawData: string): SelectCell {
    const options = this.column.property?.options ?? []
    return {
      kind: GridCellKind.Custom,
      data: {
        kind: "select-cell",
        value: rawData,
        allowedValues: options,
      },
      copyData: rawData,
      allowOverlay: true,
    }
  }

  /**
   * getCellContentViaLookup is used when the field is used as a lookup target field. 
   * lookup will convert the raw data to a multi-select cell, value split by comma. 
   * @param rawData 
   * @returns 
   */
  getCellContentViaLookup(rawData: string): MultiSelectCell {
    const multiSelectField = new MultiSelectField(this.column)
    return multiSelectField.getCellContent(rawData)
  }

  cellData2RawData(cell: SelectCell) {
    if (cell.data.value == null) return { rawData: null }
    if (cell.data.kind !== "select-cell") {
      throw new Error("invalid cell data")
    }
    if (cell.data.value.length === 0) {
      return {
        rawData: cell.data.value,
      }
    }
    if (this.options.map((i) => i.id).includes(cell.data.value)) {
      return {
        rawData: cell.data.value,
      }
    } else {
      // a new option name is entered, create a new option
      const newOption = this.addOption(cell.data.value)
      return {
        rawData: newOption[0].id || null,
        shouldUpdateColumnProperty: true,
      }
    }
  }

  static getDefaultFieldProperty() {
    return {
      options: [],
    }
  }

  static generateOptionsByNames(names: string[]) {
    return names.map((name, index) => {
      return {
        id: name,
        name,
        color:
          SelectField.colors.light[index % SelectField.colors.light.length]
            .name,
      }
    })
  }

  changeOptionName(id: string, newName: string) {
    const options = this.column.property?.options ?? []
    const option = options.find((o) => o.id === id)
    if (option) {
      option.name = newName
      option.id = newName
    }
    this.column.property.options = options
  }

  changeOptionColor(id: string, newColor: string) {
    const options = this.column.property?.options ?? []
    const option = options.find((o) => o.id === id)
    if (option) {
      option.color = newColor
    }
    this.column.property.options = options
  }

  static getNextAvailableColor(existingOptions: SelectOption[]): string {
    const allColors = SelectField.colors.light.map(c => c.name)
    const usedColors = new Set(existingOptions.map(o => o.color))
    return allColors.find(color => !usedColors.has(color)) ||
      allColors[existingOptions.length % allColors.length]
  }

  addOption(name: string) {
    const options = this.column.property?.options ?? []
    const nextColor = SelectField.getNextAvailableColor(options)

    const newOptions = [
      { id: name, name, color: nextColor },
      ...options,
    ]
    this.column.property.options = newOptions
    return newOptions
  }

  deleteOption(id: string) {
    const options = this.column.property?.options ?? []
    const index = options.findIndex((o) => o.id === id)
    if (index >= 0) {
      options.splice(index, 1)
    }
    this.column.property.options = options
  }

  /**
   * @param text tag1
   * return tag1id
   */
  // text2RawData(text: string | undefined) {
  //   // if text is isUuid
  //   if (
  //     text?.length === 36 &&
  //     text[8] === "-" &&
  //     this.options.find((i) => i.id === text)
  //   ) {
  //     return text
  //   }
  //   const option = this.options.find((i) => i.name === text)
  //   if (option) {
  //     return option.id
  //   } else {
  //     // a new option name is entered, create a new option
  //     return ""
  //     // const newOption = this.addOption(text)
  //     // return newOption[0].id
  //   }
  // }
}
