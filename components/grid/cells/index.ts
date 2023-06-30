import { useCustomCells } from "@glideapps/glide-data-grid"

import "@glideapps/glide-data-grid-cells"
import DatePicker from "./date-picker-cell"
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
  // ArticleCell,
  // SpinnerCell,
  // RangeCell,
  DatePicker,
  // LinksCell,
  // ButtonCell,
]

export function useExtraCells() {
  return useCustomCells(cells)
}

export const customCells = cells
