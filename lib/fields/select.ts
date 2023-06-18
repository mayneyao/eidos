import { GridCellKind } from "@glideapps/glide-data-grid"

import { SelectCell } from "@/components/cells/select-cell"

import { BaseField } from "./base"
import { InferCustomRendererType } from "./interface"

type Tag = {
  tag: string
  color: string
}

type SelectProperty = {
  options: Tag[]
}

const DefaultOptTags = ["foo", "bar", "baz", "qux", "quux"]
const DefaultOptColors = ["ff99c8", "fcf6bd", "d0f4de", "a9def9", "e4c1f9"]
const defaultOptions = DefaultOptTags.map((tag, i) => ({
  tag,
  color: `#${DefaultOptColors[i]}`,
}))

export class SelectField extends BaseField<SelectCell, SelectProperty> {
  static type = "select"

  getCellContent(rawData: string): SelectCell {
    const options = this.column.property?.options ?? defaultOptions
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
    return cell.data.value
  }
}
