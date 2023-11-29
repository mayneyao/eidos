import type { SelectCell } from "@/components/grid/cells/select-cell"

import { uuidv4 } from "../utils"
import { BaseField } from "./base"
import { GridCellKind } from "./const"

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
  static type = "select"

  static colors = [
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
  ]

  static defaultColor = SelectField.colors[0].name

  static colorNameValueMap = SelectField.colors.reduce((acc, color) => {
    acc[color.name] = color.value
    return acc
  }, {} as Record<string, string>)

  static getColorValue(colorName: string) {
    return `#${SelectField.colorNameValueMap[colorName]}`
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

  cellData2RawData(cell: SelectCell) {
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
        rawData: newOption[0].id,
        shouldUpdateColumnProperty: true,
      }
    }
  }

  getDefaultFieldProperty() {
    return {
      options: [],
    }
  }

  changeOptionName(id: string, newName: string) {
    const options = this.column.property?.options ?? []
    const option = options.find((o) => o.id === id)
    if (option) {
      option.name = newName
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

  addOption(name: string) {
    const options = this.column.property?.options ?? []
    const newOptions = [
      { id: uuidv4(), name, color: SelectField.defaultColor },
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
  text2RawData(text: string) {
    const option = this.options.find((i) => i.name === text)
    if (option) {
      return option.id
    } else {
      // a new option name is entered, create a new option
      return ""
      const newOption = this.addOption(text)
      return newOption[0].id
    }
  }
}
