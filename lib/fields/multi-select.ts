import { GridCellKind } from "@glideapps/glide-data-grid"
import type { TagsCell } from "@glideapps/glide-data-grid-cells"

import { BaseField } from "./base"
import { InferCustomRendererType } from "./interface"

type Tag = {
  tag: string
  color: string
}

type MultiSelectCell = InferCustomRendererType<typeof TagsCell>

type MultiSelectProperty = {
  options: Tag[]
}

const DefaultOptTags = ["foo", "bar", "baz", "qux", "quux"]
const DefaultOptColors = ["ff99c8", "fcf6bd", "d0f4de", "a9def9", "e4c1f9"]
const defaultOptions = DefaultOptTags.map((tag, i) => ({
  tag,
  color: `#${DefaultOptColors[i]}`,
}))

export class MultiSelectField extends BaseField<
  MultiSelectCell,
  MultiSelectProperty,
  string
> {
  static type = "multi-select"

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
        kind: "tags-cell",
        possibleTags: this.column.property?.options ?? defaultOptions,
        tags: rawData ? rawData.split(",") : [],
      },
      copyData: rawData,
      allowOverlay: true,
    }
  }
  cellData2RawData(cell: MultiSelectCell) {
    return cell.data.tags.join(",")
  }
}
