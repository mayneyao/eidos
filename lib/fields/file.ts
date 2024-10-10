import type { FileCell } from "@/components/table/views/grid/cells/file/file-cell"

import { getFilePreviewImage, getFileType } from "../mime/mime"
import { BaseField } from "./base"
import { CompareOperator, FieldType, GridCellKind } from "./const"

export type FileProperty = {
  proxyUrl?: string
}

export class FileField extends BaseField<FileCell, FileProperty, string> {
  static type = FieldType.File

  rawData2JSON(rawData: string) {
    return rawData
  }

  get compareOperators() {
    return [CompareOperator.IsEmpty, CompareOperator.IsNotEmpty]
  }

  static getDefaultFieldProperty() {
    return {
      proxyUrl: "https://proxy.eidos.space/?url=",
    }
  }

  /**
   * we need to proxy the image to avoid CORS issue. if the image is a remote url, we will proxy it
   */
  getProxyData = (data: string[]) => {
    if (this.column.property?.proxyUrl) {
      const proxyUrl = this.column.property?.proxyUrl
      return data.map((_d) => {
        const d = _d.trim()
        const fileType = getFileType(d)
        // show only image
        if (fileType !== "image") {
          return getFilePreviewImage(d)
        }
        if (d.startsWith("http")) {
          return proxyUrl + d
        }
        return d
      })
    }
    return data.filter(Boolean).map((d) => {
      const fileType = getFileType(d)
      // show only image
      if (fileType !== "image") {
        return getFilePreviewImage(d)
      }
      return d
    })
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
      rawData: cell.data.data?.join(",") || null,
    }
  }
}
