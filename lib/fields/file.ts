import type { FileCell } from "@/components/grid/cells/file/file-cell"

import { BaseField } from "./base"
import { GridCellKind } from "./const"

export type FileProperty = {
  proxyUrl?: string
}

export class FileField extends BaseField<FileCell, FileProperty, string> {
  static type = "file"

  /**
   * we need to proxy the image to avoid CORS issue. if the image is a remote url, we will proxy it
   */
  getProxyData = (data: string[]) => {
    if (this.column.property?.proxyUrl) {
      const proxyUrl = this.column.property?.proxyUrl
      return data.map((d) => {
        if (d.startsWith("http")) {
          return proxyUrl + d
        }
        return d
      })
    }
    return data.filter(Boolean)
  }

  getCellContent(rawData: string): FileCell {
    const data = rawData?.split(",") ?? []
    return {
      kind: GridCellKind.Custom,
      data: {
        kind: "file-cell",
        data,
        displayData: this.getProxyData(data),
        allowAdd: true,
        proxyUrl: this.column.property?.proxyUrl,
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
