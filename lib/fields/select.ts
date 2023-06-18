import { GridCellKind } from "@glideapps/glide-data-grid"
import { DropdownCell } from "@glideapps/glide-data-grid-cells"

import { BaseField } from "./base"
import { InferCustomRendererType } from "./interface"

type Tag = {
  tag: string
  color: string
}

type SelectCell = InferCustomRendererType<typeof DropdownCell>

type SelectProperty = {
  options: Tag[]
}

export class SelectField extends BaseField<SelectCell, SelectProperty> {
  static type = "select"

  getCellContent(rawData: string): SelectCell {
    const options = this.column.property?.options ?? [
      {
        tag: "foo",
        color: "#00ff00",
      },
      {
        tag: "bar",
        color: "#ff0000",
      },
    ]
    return {
      kind: GridCellKind.Custom,
      data: {
        kind: "dropdown-cell",
        value: rawData,
        allowedValues: options.map((tag) => tag.tag),
      },
      copyData: rawData,
      allowOverlay: true,
    }
  }

  cellData2RawData(cell: SelectCell) {
    return cell.data.value
  }
}
