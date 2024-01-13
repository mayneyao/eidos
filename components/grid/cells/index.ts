// import "@glideapps/glide-data-grid-cells"
import { FieldType } from "@/lib/fields/const"

import DatePicker from "./date-picker-cell"
import { FileCellRenderer } from "./file/file-cell"
import LinkCell from "./link-cell"
import MultiSelectCell from "./multi-select-cell"
import RatingCell from "./rating-cell"
import SelectCell from "./select-cell"

const cells = [
  RatingCell,
  // SparklineCell,
  // TagsCell,
  // UserProfileCell,
  SelectCell,
  MultiSelectCell,
  LinkCell,
  // ArticleCell,
  // SpinnerCell,
  // RangeCell,
  DatePicker,
  FileCellRenderer,
  // LinksCell,
  // ButtonCell,
]

export const customCells = cells

export const cellRenderMap: any = {
  [FieldType.Rating]: RatingCell,
  [FieldType.Select]: SelectCell,
  [FieldType.MultiSelect]: MultiSelectCell,
  [FieldType.Link]: LinkCell,
  [FieldType.Date]: DatePicker,
  [FieldType.File]: FileCellRenderer,
}
