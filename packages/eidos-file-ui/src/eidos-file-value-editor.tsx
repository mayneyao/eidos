import {
  AllCellRenderers,
  GridCellKind,
  type GridCell,
  type ProvideEditorCallback,
} from "@glideapps/glide-data-grid"
import DatePickerCell from "./cells/date-picker-cell"
import MultiSelectCell from "./cells/multi-select-cell"
import RatingCell from "./cells/rating-cell"
import RangeCell from "./cells/range-cell"
import SelectCell from "./cells/select-cell"
import { EidosFileAttachmentCellRenderer } from "./eidos-file-attachment-cell"
import { EidosFileRelationCellRenderer } from "./eidos-file-relation-cell"
import { EidosFileUrlImageCellRenderer } from "./eidos-file-url-image-cell"

/** Type editing content shared by Grid and record properties; hosts own navigation. */
export const eidosFileValueRenderers = [
  RatingCell,
  RangeCell,
  SelectCell,
  MultiSelectCell,
  DatePickerCell,
  EidosFileAttachmentCellRenderer,
  EidosFileUrlImageCellRenderer,
  EidosFileRelationCellRenderer,
]

export const eidosFileValueEditor: ProvideEditorCallback<GridCell> = (cell) => {
  const renderer =
    cell.kind === GridCellKind.Custom
      ? eidosFileValueRenderers.find((candidate) => candidate.isMatch(cell))
      : AllCellRenderers.find((candidate) => candidate.kind === cell.kind)
  // Renderer selection above establishes the cell/provider pair.
  const provide = renderer?.provideEditor as
    | ProvideEditorCallback<GridCell>
    | undefined
  return provide?.(cell)
}
