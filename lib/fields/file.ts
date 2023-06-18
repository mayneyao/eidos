import { GridCellKind, ImageCell } from "@glideapps/glide-data-grid"

import { BaseField } from "./base"

type FileProperty = {}

type FileCell = ImageCell

export class FileField extends BaseField<FileCell, FileProperty, string> {
  static type = "file"

  getCellContent(rawData: string): FileCell {
    const data = rawData?.split(",") ?? []
    return {
      kind: GridCellKind.Image,
      data: data,
      allowOverlay: true,
      allowAdd: true,
    }
  }

  cellData2RawData(cell: FileCell) {
    return cell.data.join(",")
  }
}
