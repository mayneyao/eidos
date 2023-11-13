import type { FileCell } from "@/components/grid/cells/file-cell"

import { BaseField } from "./base"
import { GridCellKind } from "./const"

type FileProperty = {}

export class FileField extends BaseField<FileCell, FileProperty, string> {
  static type = "file"

  getCellContent(rawData: string): FileCell {
    const data = rawData?.split(",") ?? []
    return {
      kind: GridCellKind.Custom,
      data: {
        kind: "file-cell",
        data,
        displayData: data,
        allowAdd: true,
      },
      copyData: rawData,
      allowOverlay: true,
    }
  }

  cellData2RawData(cell: FileCell) {
    return {
      rawData: cell.data.data?.join(","),
    }
  }
}
