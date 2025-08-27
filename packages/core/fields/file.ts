import { getFilePreviewImage, getFileType } from "@/lib/mime/mime"

import { BaseField } from "./base"
import { CompareOperator, FieldType, GridCellKind } from "./const"
import { EIDOS_PROXY_URL } from "@/lib/const"
import type { FileCell } from "./interface"

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
      proxyUrl: EIDOS_PROXY_URL,
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

  private encodeComma(str: string) {
    // Don't encode data URI
    if (str.startsWith('data:')) return str
    return str.replace(/,/g, '%2C')
  }

  private decodeComma(str: string) {
    // Don't decode data URI
    if (str.startsWith('data:')) return str
    return str.replace(/%2C/g, ',')
  }

  getCellContent(rawData: string): FileCell {
    // First handle data URIs, then handle normal files
    const data = rawData
      ? rawData.match(/(?:data:[^,]+,[^,]+(?:,(?=[^,]*:))?|[^,]+)/g)
        ?.filter(Boolean)
        .map(item => {
          // Don't decode data URIs
          if (item.startsWith('data:')) return item.trim()
          // Decode encoded commas in normal files
          return this.decodeComma(item.trim())
        }) ?? []
      : []
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
      rawData: cell.data.data
        ?.map(item => this.encodeComma(item))
        .join(",") || null,
    }
  }
}
