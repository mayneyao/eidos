import { useCustomCells } from "@glideapps/glide-data-grid"

// import "@glideapps/glide-data-grid-cells"
import DatePicker from "./date-picker-cell"
import FileCell from "./file-cell"
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
  FileCell,
  // LinksCell,
  // ButtonCell,
]

export function useExtraCells() {
  return useCustomCells(cells)
}

export const customCells = cells
