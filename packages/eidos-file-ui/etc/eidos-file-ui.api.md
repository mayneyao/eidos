# @eidos.space/eidos-file-ui API report

## .

```ts
import { EidosFileUIHost, EidosFileUIProvider, EidosFileUIThemeName, resolveDefaultFilePreview, useEidosFileUI } from "./context.mjs";
import { n as EidosFileCsvOperationProgressBar, r as EidosFileCsvOperationProgressBarProps, t as EidosFileCsvOperationProgress } from "./eidos-file-csv-operation-progress-HASH.mjs";
import { EidosFileCsvImportPopover, EidosFileCsvImportPopoverProps } from "./eidos-file-csv-import-popover.mjs";
import { n as EidosFileEditorDataSource, t as EidosFileDataSource } from "./data-source-HASH.mjs";
import { EidosFileDataGrid, EidosFileDataGridProps } from "./eidos-file-data-grid.mjs";
import { EidosFileFormulaEditorPopover, EidosFileLookupEditorPopover } from "./eidos-file-derived-field-editor.mjs";
import { S as builtInEidosFileViewRenderers, _ as EidosFileViewRenderer, a as EidosFilePluginSlot, b as EidosFileViewSelection, c as defineEidosFilePlugin, d as EidosFileEditorView, f as EidosFileEditorViewProps, g as EidosFileViewCommand, h as EidosFileViewCapabilities, i as EidosFilePluginRegistry, l as defineEidosFileView, m as EidosFileUnsupportedView, n as EidosFilePlugin, o as EidosFileViewPluginContribution, p as EidosFileGridRenderer, r as EidosFilePluginContext, s as createEidosFilePluginRegistry, t as EidosFileActionPluginContribution, u as EidosFileCommandContext, v as EidosFileViewRendererProps, x as EidosFileViewState, y as EidosFileViewRendererRegistry } from "./plugin-DL7-hwpu.mjs";
import { EidosFileEditorContent, EidosFileEditorRoot, EidosFileEditorWorkbar, EidosFileSheetTabStrip, EidosFileViewTabStrip, EidosFileViewTypeIcon } from "./eidos-file-editor-chrome.mjs";
import { eidosFileErrorMessage } from "./eidos-file-error-message.mjs";
import { EidosFileFieldCreatePopover, EidosFileFieldCreatePopoverProps } from "./eidos-file-field-create-popover.mjs";
import { EIDOS_FILE_FIELD_TYPE_GROUPS, EidosFileCreatableFieldType, EidosFileFieldTypePicker } from "./eidos-file-field-type-picker.mjs";
import { n as EidosFileFormulaComposerProps, r as EidosFileFormulaInputRef, t as EidosFileFormulaComposer } from "./eidos-file-formula-composer-HASH.mjs";
import { EidosFileGalleryView } from "./eidos-file-gallery-view.mjs";
import { EidosFileKanbanView } from "./eidos-file-kanban-view.mjs";
import { EidosFileQueryToolbar } from "./eidos-file-query-toolbar.mjs";
import { a as isEidosFileRecordCoverField, c as EIDOS_FILE_OPTION_COLORS, d as eidosFileNumberProperty, f as eidosFileOptionColor, i as eidosFileRecordCardPageProjection, l as EidosFileNumberProperty, m as nextEidosFileOptionColor, n as EidosFileRecordCardLayout, o as selectEidosFileRecordCardFields, p as eidosFileSelectOptions, r as createEidosFileRecordCardLayout, s as DEFAULT_BASE_NUMBER_PROPERTY, t as EidosFileRecordCardFieldLayout, u as EidosFileSelectOption } from "./eidos-file-record-card-layout-HASH.mjs";
import { EidosFileRecordCard } from "./eidos-file-record-card.mjs";
import { EidosFileRecordDeleteDialog } from "./eidos-file-record-delete-dialog.mjs";
import { EidosFileRowWindow, EidosFileRowWindowMergeMode, EidosFileRowWindowRequest, mergeRowWindowPage, requestForPrefetchedRowWindow, requestForRowWindow, rowFromWindow } from "./eidos-file-row-window.mjs";
import { EidosFileSheetCreatePopover } from "./eidos-file-sheet-create-popover.mjs";
import { EidosFileSheetTabActions, EidosFileSheetTabRenderer, EidosFileSheetTabs, EidosFileSheetTabsProps } from "./eidos-file-sheet-tabs.mjs";
import { EIDOS_FILE_EXTENSION_VIEW_PREFIX, EidosFileBuiltInViewType, EidosFileExternalViewContribution, EidosFileViewSelector, EidosFileViewSelectorRequest, eidosFileExtensionContributionId, eidosFileExtensionViewType, isEidosFileBuiltInViewType } from "./eidos-file-view-HASH.mjs";
import { EidosFileViewTabActions, EidosFileViewTabRenderer, EidosFileViewTabs, EidosFileViewTabsProps } from "./eidos-file-view-tabs.mjs";
import { EIDOS_FILE_VIRTUAL_SCROLL_MAX_ITEMS, EIDOS_FILE_VIRTUAL_SCROLL_MAX_SIZE, EidosFileBoundedVirtualizerResult, EidosFileVirtualWindow, eidosFileVirtualItemOffset, eidosFileVirtualLogicalOffset, eidosFileVirtualPhysicalOffset, eidosFileVirtualPhysicalSize, eidosFileVirtualWindowForOffset, resetEidosFileVirtualizerMeasurements, useEidosFileBoundedVirtualizer } from "./eidos-file-virtual-scroll.mjs";
import { EidosFileProvider, EidosFileProviderProps, EidosFileReactContextValue, EidosFileReactTrust, EidosFileViewHost, EidosFileViewHostProps, useEidosFile, useEidosFileSession } from "./platform.mjs";
import { useEidosFileRecordInspectorRow } from "./use-eidos-file-record-inspector-row.mjs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogOverlay, AlertDialogPortal, AlertDialogTitle, AlertDialogTrigger } from "./ui/alert-dialog.mjs";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "./ui/dropdown-menu.mjs";
import { DragEndEvent, KanbanBoard, KanbanBoardProps, KanbanCard, KanbanCardProps, KanbanCards, KanbanCardsProps, KanbanHeader, KanbanHeaderProps, KanbanProvider, KanbanProviderProps, Status } from "./ui/kanban.mjs";
import { EidosFileColumnStatConfig, EidosFileColumnStatResult, EidosFileColumnStatType, EidosFileFieldInfo, EidosFileFilterGroup, EidosFileOptionValueChange, EidosFileRelationValue, EidosFileRow, EidosFileRowMutationResult, EidosFileRowPage, EidosFileRowQuery, EidosFileRowRange, EidosFileRowValue, EidosFileRowsMutationResult, EidosFileSort, EidosFileSortDirection, EidosFileSqlPrimitive, EidosFileTableSnapshot, EidosFileViewInfo, UpdateEidosFileFieldInput, UpdateEidosFileViewInput } from "@eidos.space/eidos-file";
import * as _$react from "react";
import { KeyboardEvent } from "react";
import { BaseDrawArgs, BaseGridCell, CustomCell, CustomRenderer, DataEditorProps, DataEditorRef, EditableGridCell, GridCell, GridColumn, GridSelection, Item, ProvideEditorComponent, Rectangle, SelectionRange, SpriteMap, Theme } from "@glideapps/glide-data-grid";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";
import { NumberFormatValues } from "react-number-format/types/types.js";

//#region src/eidos-file-field-property-panel.d.ts
declare function EidosFileFieldPropertyPanel({
  field,
  disabled,
  onClose,
  onUpdate,
  onDelete,
  onEditFormula,
  onEditLookup
}: {
  field: EidosFileFieldInfo;
  disabled: boolean;
  onClose: () => void;
  onUpdate: (field: EidosFileFieldInfo, changes: UpdateEidosFileFieldInput) => Promise<void> | void;
  onDelete: (field: EidosFileFieldInfo) => void;
  onEditFormula?: (field: EidosFileFieldInfo) => void;
  onEditLookup?: (field: EidosFileFieldInfo) => void;
}): _$react_jsx_runtime0.JSX.Element;
//#endregion
//#region src/eidos-file-field-visibility.d.ts
declare function isOptionalEidosFileSystemField(field: EidosFileFieldInfo): boolean;
declare function eidosFileFieldDisplayName(field: EidosFileFieldInfo): string;
declare function eidosFileViewVisibleSystemFields(view: EidosFileViewInfo | undefined): string[];
declare function visibleEidosFileFields(fields: EidosFileFieldInfo[], hiddenFields?: readonly string[], visibleSystemFields?: readonly string[]): EidosFileFieldInfo[];
//#endregion
//#region src/eidos-file-attachment-cell.d.ts
interface EidosFileAttachmentCellData {
  readonly kind: "eidos-file-file-cell";
  readonly paths: string[];
  readonly displayData: string[];
  readonly onImport?: () => Promise<string[]>;
  readonly onOpen?: (path: string) => void;
  readonly onReveal?: (path: string) => Promise<void> | void;
}
type EidosFileAttachmentCell = CustomCell<EidosFileAttachmentCellData>;
declare function eidosFileAttachmentDisplayData(paths: readonly string[], resolvePreview?: (path: string) => string): string[];
declare const EidosFileAttachmentCellEditor: ProvideEditorComponent<EidosFileAttachmentCell>;
declare const EidosFileAttachmentCellRenderer: CustomRenderer<EidosFileAttachmentCell>;
//#endregion
//#region src/eidos-file-grid.d.ts
interface EidosFileGridProps {
  table: EidosFileTableSnapshot;
  view?: EidosFileViewInfo;
  gridTheme?: Partial<Theme>;
  disabled?: boolean;
  reloadToken?: number;
  loadPage: (offset: number, limit: number) => Promise<EidosFileRowPage>;
  loadColumnStats?: (configs: EidosFileColumnStatConfig[]) => Promise<EidosFileColumnStatResult[]>;
  onAddRow: () => Promise<EidosFileRowMutationResult>;
  onCellEdit: (row: EidosFileRow, field: EidosFileFieldInfo, value: EidosFileSqlPrimitive) => Promise<EidosFileRowMutationResult>;
  onInspectorCellEdit?: (row: EidosFileRow, field: EidosFileFieldInfo, value: EidosFileSqlPrimitive) => Promise<EidosFileRowMutationResult>;
  onRowsEdit?: (edits: EidosFileGridRowEdit[]) => Promise<EidosFileRowsMutationResult>;
  onSelectedRowsChange?: (ranges: EidosFileRowRange[]) => void;
  onRowCountChange?: (rowCount: number | null) => void;
  searchResultIndex?: number | null;
  onImportFiles?: () => Promise<string[]>;
  onImportDroppedFiles?: (files: File[]) => Promise<string[]>;
  onOpenFile?: (path: string) => void;
  onRevealFile?: (path: string) => Promise<void> | void;
  onOpenRecordInTab?: (row: EidosFileRow) => void;
  onSearchRelation?: (field: EidosFileFieldInfo, query: string) => Promise<EidosFileRelationValue[]>;
  propertyField?: EidosFileFieldInfo | null;
  onPropertyFieldOpen?: (field: EidosFileFieldInfo) => void;
  onPropertyFieldClose?: () => void;
  onFieldUpdate?: (field: EidosFileFieldInfo, changes: UpdateEidosFileFieldInput) => Promise<void> | void;
  onAddField?: (position?: number) => void;
  onEditFormula?: (field: EidosFileFieldInfo) => void;
  onEditLookup?: (field: EidosFileFieldInfo) => void;
  onDeleteField?: (field: EidosFileFieldInfo) => void;
  onRequestDeleteRows?: (ranges: EidosFileRowRange[]) => void;
  onViewUpdate?: (changes: UpdateEidosFileViewInput) => Promise<void> | void;
  onError?: (error: unknown) => void;
}
interface EidosFileGridRowEdit {
  row: EidosFileRow;
  changes: EidosFileRow;
}
declare const EidosFileGrid: _$react.NamedExoticComponent<EidosFileGridProps>;
//#endregion
//#region src/eidos-file-grid-adapter.d.ts
/** Glide cell option shape derived from a direct Eidos File option value. */
interface EidosFileGridSelectOption {
  id: string;
  name: string;
  color: string;
}
declare function eidosFileGridColumn(field: EidosFileFieldInfo): GridColumn;
declare function eidosFileGridSelectOptions(field: EidosFileFieldInfo): EidosFileGridSelectOption[];
declare function eidosFileValueToGridCell(field: EidosFileFieldInfo, value: EidosFileRowValue | undefined, readonly?: boolean, row?: EidosFileRow): GridCell;
declare function gridCellToEidosFileValue(field: EidosFileFieldInfo, cell: EditableGridCell): EidosFileSqlPrimitive;
//#endregion
//#region src/eidos-file-grid-menus.d.ts
interface EidosFileFieldMenuState {
  bounds: Rectangle;
  field: EidosFileFieldInfo;
  fieldIndex: number;
  openedFromTouch?: boolean;
}
interface EidosFileCellMenuState {
  bounds: Rectangle;
  field: EidosFileFieldInfo;
  fieldIndex: number;
  point: {
    x: number;
    y: number;
  };
  row: EidosFileRow;
  rowIndex: number;
  rowRanges: EidosFileRowRange[];
}
declare function EidosFileFieldMenu({
  state,
  open,
  sortDirection,
  frozen,
  canUpdateView,
  canEditStructure,
  onOpenChange,
  onEditProperty,
  statType,
  onCalculate,
  onSort,
  onInsert,
  onToggleFreeze,
  onDelete
}: {
  state: EidosFileFieldMenuState | null;
  open: boolean;
  sortDirection?: EidosFileSortDirection;
  frozen: boolean;
  canUpdateView: boolean;
  canEditStructure: boolean;
  onOpenChange: (open: boolean) => void;
  onEditProperty?: (field: EidosFileFieldInfo) => void;
  statType?: EidosFileColumnStatType;
  onCalculate?: (state: EidosFileFieldMenuState) => void;
  onSort: (field: EidosFileFieldInfo, direction: EidosFileSortDirection | null) => void;
  onInsert: (index: number) => void;
  onToggleFreeze: (fieldIndex: number, frozen: boolean) => void;
  onDelete: (field: EidosFileFieldInfo) => void;
}): _$react_jsx_runtime0.JSX.Element;
declare function EidosFileColumnStatMenu({
  state,
  open,
  value,
  disabled,
  onOpenChange,
  onBack,
  onChange
}: {
  state: EidosFileFieldMenuState | null;
  open: boolean;
  value?: EidosFileColumnStatType;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
  onChange: (value: EidosFileColumnStatType | null) => void;
}): _$react_jsx_runtime0.JSX.Element;
declare function EidosFileCellMenu({
  state,
  open,
  selectionCount,
  cellText,
  filePaths,
  canDelete,
  onOpenChange,
  onOpenRecord,
  onCopyCell,
  onCopyRecordId,
  onOpenUrl,
  onOpenFile,
  onRevealFile,
  onDeleteRows
}: {
  state: EidosFileCellMenuState | null;
  open: boolean;
  selectionCount: number;
  cellText: string;
  filePaths: string[];
  canDelete: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenRecord: (state: EidosFileCellMenuState) => void;
  onCopyCell: (text: string) => void;
  onCopyRecordId: (id: string) => void;
  onOpenUrl: (url: string) => void;
  onOpenFile?: (path: string) => void;
  onRevealFile?: (path: string) => void;
  onDeleteRows: (ranges: EidosFileRowRange[]) => void;
}): _$react_jsx_runtime0.JSX.Element;
//#endregion
//#region src/eidos-file-grid-scrollbar.d.ts
declare function eidosFileGridScrollbarConfig(hasHorizontalScroll: boolean): Pick<DataEditorProps, "experimental">;
//#endregion
//#region src/eidos-file-number-properties-editor.d.ts
declare function EidosFileNumberPropertiesEditor({
  property: sourceProperty,
  disabled,
  onChange,
  className
}: {
  property: EidosFileNumberProperty;
  disabled: boolean;
  onChange: (property: EidosFileNumberProperty) => Promise<void> | void;
  className?: string;
}): _$react_jsx_runtime0.JSX.Element;
//#endregion
//#region src/eidos-file-record-field-editor.d.ts
declare function EidosFileRecordFieldEditor({
  field,
  row,
  disabled,
  onChange
}: {
  field: EidosFileFieldInfo;
  row: EidosFileRow;
  disabled: boolean;
  onChange: (value: EidosFileSqlPrimitive) => Promise<void>;
}): _$react_jsx_runtime0.JSX.Element | null;
//#endregion
//#region src/eidos-file-record-attachment-editor.d.ts
declare function EidosFileRecordAttachmentEditor({
  value,
  disabled,
  onChange,
  onImportFiles,
  onImportDroppedFiles,
  onOpenFile,
  onRevealFile,
  onError
}: {
  value: EidosFileRow[string];
  disabled: boolean;
  onChange: (value: string | null) => Promise<void>;
  onImportFiles: () => Promise<string[]>;
  onImportDroppedFiles?: (files: File[]) => Promise<string[]>;
  onOpenFile?: (path: string) => void;
  onRevealFile?: (path: string) => void;
  onError?: (error: unknown) => void;
}): _$react_jsx_runtime0.JSX.Element;
//#endregion
//#region src/eidos-file-record-format.d.ts
declare function eidosFileRecordFieldText(row: EidosFileRow, field: EidosFileFieldInfo): string;
declare function eidosFileRecordTitle(row: EidosFileRow): string;
//#endregion
//#region src/eidos-file-record-inspector.d.ts
interface EidosFileRecordInspectorProps {
  row: EidosFileRow;
  fields: EidosFileFieldInfo[];
  variant?: "panel" | "page";
  onClose?: () => void;
  onOpenInTab?: (row: EidosFileRow) => void;
  onCopyRecordId: (id: string) => void;
  onCellEdit?: (row: EidosFileRow, field: EidosFileFieldInfo, value: EidosFileSqlPrimitive) => Promise<EidosFileRowMutationResult>;
  disabled?: boolean;
  loading?: boolean;
  loadError?: string | null;
  onRetryLoad?: () => void;
  onError?: (error: unknown) => void;
  onImportFiles?: () => Promise<string[]>;
  onImportDroppedFiles?: (files: File[]) => Promise<string[]>;
  onSearchRelation?: (field: EidosFileFieldInfo, query: string) => Promise<EidosFileRelationValue[]>;
  onOpenFile?: (path: string) => void;
  onRevealFile?: (path: string) => void;
}
declare function EidosFileRecordInspector({
  row,
  fields,
  variant,
  onClose,
  onOpenInTab,
  onCopyRecordId,
  onCellEdit,
  disabled,
  loading,
  loadError,
  onRetryLoad,
  onError,
  onImportFiles,
  onImportDroppedFiles,
  onSearchRelation,
  onOpenFile,
  onRevealFile
}: EidosFileRecordInspectorProps): _$react_jsx_runtime0.JSX.Element;
//#endregion
//#region src/eidos-file-record-relation-editor.d.ts
declare function EidosFileRecordRelationEditor({
  row,
  field,
  disabled,
  onChange,
  onSearch,
  onError
}: {
  row: EidosFileRow;
  field: EidosFileFieldInfo;
  disabled: boolean;
  onChange: (value: string | null) => Promise<void>;
  onSearch: (field: EidosFileFieldInfo, query: string) => Promise<EidosFileRelationValue[]>;
  onError?: (error: unknown) => void;
}): _$react_jsx_runtime0.JSX.Element;
//#endregion
//#region src/eidos-file-relation-cell.d.ts
interface EidosFileRelationCellData {
  readonly kind: "eidos-file-relation-cell";
  readonly values: EidosFileRelationValue[];
  readonly multiple: boolean;
  readonly onSearch?: (query: string) => Promise<EidosFileRelationValue[]>;
}
type EidosFileRelationCell = CustomCell<EidosFileRelationCellData>;
declare const EidosFileRelationCellEditor: ProvideEditorComponent<EidosFileRelationCell>;
declare const EidosFileRelationCellRenderer: CustomRenderer<EidosFileRelationCell>;
//#endregion
//#region src/eidos-file-relation-listbox.d.ts
type EidosFileRelationListboxEdge = "first" | "last";
declare function useEidosFileRelationListbox(choices: EidosFileRelationValue[]): {
  activeOption: EidosFileRelationValue | null;
  activeOptionId: string | null;
  activeOptionIndex: number;
  activeDescendantId: string | undefined;
  listboxId: string;
  moveActiveOption: (direction: -1 | 1 | EidosFileRelationListboxEdge) => void;
  optionId: (index: number) => string;
  setActiveOptionId: _$react.Dispatch<_$react.SetStateAction<string | null>>;
};
//#endregion
//#region src/eidos-file-relation-option-list.d.ts
declare function EidosFileRelationOptionList({
  accessibleName,
  activeOptionId,
  availableValues,
  disabled,
  listboxId,
  multiple,
  optionId,
  query,
  selectedValues,
  onActiveOptionChange,
  onToggle
}: {
  accessibleName: string;
  activeOptionId: string | null;
  availableValues: EidosFileRelationValue[];
  disabled?: boolean;
  listboxId: string;
  multiple: boolean;
  optionId: (index: number) => string;
  query: string;
  selectedValues: EidosFileRelationValue[];
  onActiveOptionChange: (optionId: string) => void;
  onToggle: (option: EidosFileRelationValue) => void;
}): _$react_jsx_runtime0.JSX.Element;
//#endregion
//#region src/eidos-file-select-options-editor.d.ts
declare function EidosFileOptionsEditor({
  options: sourceOptions,
  disabled,
  onChange,
  className
}: {
  options: EidosFileSelectOption[];
  disabled: boolean;
  onChange: (options: EidosFileSelectOption[], valueChanges?: EidosFileOptionValueChange[]) => Promise<void> | void;
  className?: string;
}): _$react_jsx_runtime0.JSX.Element;
declare function EidosFileSelectOptionsEditor({
  field,
  disabled,
  onChange
}: {
  field: EidosFileFieldInfo;
  disabled: boolean;
  onChange: (property: Record<string, unknown>, optionValueChanges?: EidosFileOptionValueChange[]) => Promise<void> | void;
}): _$react_jsx_runtime0.JSX.Element;
//#endregion
//#region src/eidos-file-view-layout.d.ts
declare function orderedEidosFileFields(fields: EidosFileFieldInfo[], view?: EidosFileViewInfo): EidosFileFieldInfo[];
declare function eidosFileViewFreezeColumns(view: EidosFileViewInfo | undefined, fieldCount: number): number;
declare function nextEidosFileFieldSorts(sorts: EidosFileSort[], field: string, direction: EidosFileSortDirection | null): EidosFileSort[];
declare function rowSelectionRanges(selection: GridSelection): EidosFileRowRange[];
declare function contextRowRanges(selection: GridSelection | undefined, rowIndex: number): EidosFileRowRange[];
declare function rowRangeCount(ranges: EidosFileRowRange[]): number;
//#endregion
//#region src/eidos-file-view-query.d.ts
/** Builds the runtime query represented by a saved view and transient search. */
declare function eidosFileViewRowQuery(view: EidosFileViewInfo | undefined, search?: string): EidosFileRowQuery;
/** Adds a Kanban group constraint without changing the saved view filter. */
declare function eidosFileViewGroupFilter(current: EidosFileFilterGroup | null | undefined, groupField: string, value: string | null): EidosFileFilterGroup;
//#endregion
//#region src/grid-default-config.d.ts
declare const defaultConfig: Partial<DataEditorProps>;
declare function getScrollbarWidth(): number;
//#endregion
//#region src/header-icons.d.ts
declare const makeHeaderIcons: (size: number) => SpriteMap;
declare const headerIcons: SpriteMap;
//#endregion
//#region src/theme.d.ts
declare function useEidosFileGridTheme(themeName: EidosFileUIThemeName): Theme;
//#endregion
//#region src/use-undo-redo.d.ts
interface UndoRedoEdit {
  cell: Item;
  newValue: EditableGridCell;
}
declare function useUndoRedo(gridRef: React.RefObject<DataEditorRef>, getCellContent: (cell: Item) => GridCell, onCellEdited: (cell: Item, newValue: EditableGridCell) => void, onGridSelectionChange?: (newVal: GridSelection) => void, isActive?: () => boolean, onCellsEdited?: (edits: readonly UndoRedoEdit[]) => void, maxHistoryBatches?: number): {
  undo: () => void;
  redo: () => void;
  reset: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onCellEdited: (cell: Item, newValue: EditableGridCell) => void;
  onCellsEdited: (edits: readonly UndoRedoEdit[]) => void;
  onGridSelectionChange: (newVal: GridSelection) => void;
  gridSelection: GridSelection | null;
  historyRows: Set<number>;
};
//#endregion
//#region src/use-eidos-file-tab-strip.d.ts
interface EidosFileTabStripItem {
  id: string;
}
declare function useEidosFileTabStrip<T extends EidosFileTabStripItem>({
  items,
  activeId,
  onSelect
}: {
  items: T[];
  activeId?: string | null;
  onSelect: (id: string) => void;
}): {
  activeTabRef: _$react.RefObject<HTMLButtonElement>;
  canScrollBackward: boolean;
  canScrollForward: boolean;
  navigateTabs: (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => void;
  scrollTabs: (direction: -1 | 1) => void;
  tabStopId: string | null | undefined;
  updateScrollState: () => void;
  viewportRef: _$react.RefObject<HTMLDivElement>;
};
//#endregion
//#region src/cells/date-picker-cell.d.ts
interface DatePickerCellProps {
  readonly kind: "date-picker-cell";
  readonly date: Date | undefined;
  readonly displayDate: string;
  readonly format: "date" | "datetime-local";
}
type DatePickerCell = CustomCell<DatePickerCellProps>;
declare const renderer: CustomRenderer<DatePickerCell>;
//#endregion
//#region src/cells/grid-cell-helper.d.ts
interface LinkCellData {
  id: string;
  title: string;
  img?: string;
}
interface CornerRadius {
  tl: number;
  tr: number;
  bl: number;
  br: number;
}
declare function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number | CornerRadius): void;
declare const removeItemFromArray: (_arr: any[], item: any) => any[];
/** @category Drawing */
declare function getMiddleCenterBias(ctx: CanvasRenderingContext2D, font: string | Theme): number;
/** @category Drawing */
declare function measureTextCached(s: string, ctx: CanvasRenderingContext2D, font?: string): TextMetrics;
declare function drawDrilldownCell(args: BaseDrawArgs, data: readonly LinkCellData[]): void;
declare function drawImage(args: BaseDrawArgs, data: readonly string[], rounding?: number, contentAlign?: BaseGridCell["contentAlign"]): void;
//#endregion
//#region src/cells/multi-select-cell.d.ts
interface MultiSelectCellProps {
  readonly kind: "multi-select-cell";
  readonly values: readonly string[] | null;
  readonly readonly?: boolean;
  readonly allowedValues: readonly EidosFileGridSelectOption[];
  readonly allowCreate?: boolean;
}
type MultiSelectCell = CustomCell<MultiSelectCellProps>;
declare const renderer$1: CustomRenderer<MultiSelectCell>;
//#endregion
//#region src/cells/number-overlay-editor.d.ts
interface Props {
  readonly value: number | undefined;
  readonly disabled?: boolean;
  readonly onChange: (values: NumberFormatValues) => void;
  readonly highlight: boolean;
  readonly validatedSelection?: SelectionRange;
  readonly fixedDecimals?: number;
  readonly allowNegative?: boolean;
  readonly thousandSeparator?: boolean | string;
  readonly decimalSeparator?: string;
}
declare const NumberOverlayEditor: _$react.FunctionComponent<Props>;
//#endregion
//#region src/cells/range-cell.d.ts
interface RangeCellProps {
  readonly kind: "range-cell";
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly label?: string;
  readonly measureLabel?: string;
  readonly color?: string;
}
type RangeCell = CustomCell<RangeCellProps>;
declare const renderer$2: CustomRenderer<RangeCell>;
//#endregion
//#region src/cells/rating-cell.d.ts
interface RatingCellProps {
  readonly kind: "rating-cell";
  readonly rating: number;
}
type RatingCell = CustomCell<RatingCellProps>;
declare const renderer$3: CustomRenderer<RatingCell>;
//#endregion
//#region src/cells/select-cell.d.ts
interface SelectCellProps {
  readonly kind: "select-cell";
  readonly value: string | null;
  readonly allowedValues: readonly EidosFileGridSelectOption[];
  readonly allowCreate?: boolean;
  readonly readonly?: boolean;
}
type SelectCell = CustomCell<SelectCellProps>;
declare const renderer$4: CustomRenderer<SelectCell>;
//#endregion
export { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogOverlay, AlertDialogPortal, AlertDialogTitle, AlertDialogTrigger, DEFAULT_BASE_NUMBER_PROPERTY, renderer as DatePickerCell, type DatePickerCell as DatePickerCellType, DragEndEvent, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, EIDOS_FILE_EXTENSION_VIEW_PREFIX, EIDOS_FILE_FIELD_TYPE_GROUPS, EIDOS_FILE_OPTION_COLORS, EIDOS_FILE_VIRTUAL_SCROLL_MAX_ITEMS, EIDOS_FILE_VIRTUAL_SCROLL_MAX_SIZE, EidosFileActionPluginContribution, EidosFileAttachmentCell, EidosFileAttachmentCellEditor, EidosFileAttachmentCellRenderer, EidosFileBoundedVirtualizerResult, EidosFileBuiltInViewType, EidosFileCellMenu, EidosFileCellMenuState, EidosFileColumnStatMenu, EidosFileCommandContext, EidosFileCreatableFieldType, EidosFileCsvImportPopover, EidosFileCsvImportPopoverProps, EidosFileCsvOperationProgress, EidosFileCsvOperationProgressBar, EidosFileCsvOperationProgressBarProps, EidosFileDataGrid, EidosFileDataGridProps, EidosFileDataSource, EidosFileEditorContent, EidosFileEditorDataSource, EidosFileEditorRoot, EidosFileEditorView, EidosFileEditorViewProps, EidosFileEditorWorkbar, EidosFileExternalViewContribution, EidosFileFieldCreatePopover, EidosFileFieldCreatePopoverProps, EidosFileFieldMenu, EidosFileFieldMenuState, EidosFileFieldPropertyPanel, EidosFileFieldTypePicker, EidosFileFormulaComposer, EidosFileFormulaComposerProps, EidosFileFormulaEditorPopover, EidosFileFormulaInputRef, EidosFileGalleryView, EidosFileGrid, EidosFileGridProps, EidosFileGridRenderer, EidosFileGridRowEdit, EidosFileKanbanView, EidosFileLookupEditorPopover, EidosFileNumberPropertiesEditor, EidosFileNumberProperty, EidosFileOptionsEditor, EidosFilePlugin, EidosFilePluginContext, EidosFilePluginRegistry, EidosFilePluginSlot, EidosFileProvider, EidosFileProviderProps, EidosFileQueryToolbar, EidosFileReactContextValue, EidosFileReactTrust, EidosFileRecordAttachmentEditor, EidosFileRecordCard, EidosFileRecordCardFieldLayout, EidosFileRecordCardLayout, EidosFileRecordDeleteDialog, EidosFileRecordFieldEditor, EidosFileRecordInspector, EidosFileRecordInspectorProps, EidosFileRecordRelationEditor, EidosFileRelationCell, EidosFileRelationCellEditor, EidosFileRelationCellRenderer, EidosFileRelationOptionList, EidosFileRowWindow, EidosFileRowWindowMergeMode, EidosFileRowWindowRequest, EidosFileSelectOption, EidosFileSelectOptionsEditor, EidosFileSheetCreatePopover, EidosFileSheetTabActions, EidosFileSheetTabRenderer, EidosFileSheetTabStrip, EidosFileSheetTabs, EidosFileSheetTabsProps, EidosFileTabStripItem, EidosFileUIHost, EidosFileUIProvider, EidosFileUIThemeName, EidosFileUnsupportedView, EidosFileViewCapabilities, EidosFileViewCommand, EidosFileViewHost, EidosFileViewHostProps, EidosFileViewPluginContribution, EidosFileViewRenderer, EidosFileViewRendererProps, EidosFileViewRendererRegistry, EidosFileViewSelection, EidosFileViewSelector, EidosFileViewSelectorRequest, EidosFileViewState, EidosFileViewTabActions, EidosFileViewTabRenderer, EidosFileViewTabStrip, EidosFileViewTabs, EidosFileViewTabsProps, EidosFileViewTypeIcon, EidosFileVirtualWindow, KanbanBoard, KanbanBoardProps, KanbanCard, KanbanCardProps, KanbanCards, KanbanCardsProps, KanbanHeader, KanbanHeaderProps, KanbanProvider, KanbanProviderProps, renderer$1 as MultiSelectCell, type MultiSelectCell as MultiSelectCellType, NumberOverlayEditor, renderer$2 as RangeCell, type RangeCell as RangeCellType, renderer$3 as RatingCell, type RatingCell as RatingCellType, renderer$4 as SelectCell, type SelectCell as SelectCellType, Status, UndoRedoEdit, builtInEidosFileViewRenderers, contextRowRanges, createEidosFilePluginRegistry, createEidosFileRecordCardLayout, defaultConfig, defineEidosFilePlugin, defineEidosFileView, drawDrilldownCell, drawImage, eidosFileAttachmentDisplayData, eidosFileErrorMessage, eidosFileExtensionContributionId, eidosFileExtensionViewType, eidosFileFieldDisplayName, eidosFileGridColumn, eidosFileGridScrollbarConfig, eidosFileGridSelectOptions, eidosFileNumberProperty, eidosFileOptionColor, eidosFileRecordCardPageProjection, eidosFileRecordFieldText, eidosFileRecordTitle, eidosFileSelectOptions, eidosFileValueToGridCell, eidosFileViewFreezeColumns, eidosFileViewGroupFilter, eidosFileViewRowQuery, eidosFileViewVisibleSystemFields, eidosFileVirtualItemOffset, eidosFileVirtualLogicalOffset, eidosFileVirtualPhysicalOffset, eidosFileVirtualPhysicalSize, eidosFileVirtualWindowForOffset, getMiddleCenterBias, getScrollbarWidth, gridCellToEidosFileValue, headerIcons, isEidosFileBuiltInViewType, isEidosFileRecordCoverField, isOptionalEidosFileSystemField, makeHeaderIcons, measureTextCached, mergeRowWindowPage, nextEidosFileFieldSorts, nextEidosFileOptionColor, orderedEidosFileFields, removeItemFromArray, requestForPrefetchedRowWindow, requestForRowWindow, resetEidosFileVirtualizerMeasurements, resolveDefaultFilePreview, roundedRect, rowFromWindow, rowRangeCount, rowSelectionRanges, selectEidosFileRecordCardFields, useEidosFile, useEidosFileBoundedVirtualizer, useEidosFileGridTheme, useEidosFileRecordInspectorRow, useEidosFileRelationListbox, useEidosFileSession, useEidosFileTabStrip, useEidosFileUI, useUndoRedo, visibleEidosFileFields };
```

## ./context

```ts
import { ReactNode } from "react";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/context.d.ts
type EidosFileUIThemeName = "light" | "dark";
interface EidosFileUIHost {
  themeName: EidosFileUIThemeName;
  resolveAssetUrl(path: string): string;
  resolveFilePreview(path: string): string;
}
declare function EidosFileUIProvider({
  children,
  themeName,
  resolveAssetUrl,
  resolveFilePreview
}: Partial<EidosFileUIHost> & {
  children: ReactNode;
}): _$react_jsx_runtime0.JSX.Element;
declare function useEidosFileUI(): EidosFileUIHost;
declare function resolveDefaultFilePreview(path: string): string;
//#endregion
export { EidosFileUIHost, EidosFileUIProvider, EidosFileUIThemeName, resolveDefaultFilePreview, useEidosFileUI };
```

## ./eidos-file-csv-import-popover

```ts
import { t as EidosFileCsvOperationProgress } from "./eidos-file-csv-operation-progress-HASH.mjs";
import { EidosFileCsvImportOptions, EidosFileCsvImportPlan } from "@eidos.space/eidos-file";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/eidos-file-csv-import-popover.d.ts
type CsvSelection = {
  canceled: true;
  token: null;
  fileName: null;
} | {
  canceled: false;
  token: string;
  fileName: string;
};
interface EidosFileCsvImportPopoverProps {
  disabled?: boolean;
  triggerVariant?: "workbar" | "empty-state" | "sheet-create";
  copy?: {
    actionAriaLabel?: string;
    actionLabel?: string;
  };
  onSelect: () => Promise<CsvSelection>;
  onPreview: (token: string, options: EidosFileCsvImportOptions, operationId: string) => Promise<EidosFileCsvImportPlan>;
  onImport: (token: string, options: EidosFileCsvImportOptions, operationId: string) => Promise<void>;
  onProgress: (operationId: string) => Promise<EidosFileCsvOperationProgress | null>;
  onCancel: (operationId: string) => Promise<boolean>;
  onImported?: () => void;
}
declare function EidosFileCsvImportPopover({
  disabled,
  triggerVariant,
  copy,
  onSelect,
  onPreview,
  onImport,
  onProgress,
  onCancel,
  onImported
}: EidosFileCsvImportPopoverProps): _$react_jsx_runtime0.JSX.Element;
//#endregion
export { EidosFileCsvImportPopover, EidosFileCsvImportPopoverProps };
```

## ./eidos-file-csv-operation-progress

```ts
import { n as EidosFileCsvOperationProgressBar, r as EidosFileCsvOperationProgressBarProps, t as EidosFileCsvOperationProgress } from "./eidos-file-csv-operation-progress-HASH.mjs";
export { EidosFileCsvOperationProgress, EidosFileCsvOperationProgressBar, EidosFileCsvOperationProgressBarProps };
```

## ./eidos-file-data-grid

```ts
import { n as EidosFileEditorDataSource } from "./data-source-HASH.mjs";
import { EidosFileFieldInfo, EidosFileRowMutationResult, EidosFileRowQuery, EidosFileRowRange, EidosFileSnapshot, EidosFileTableSnapshot, EidosFileViewInfo } from "@eidos.space/eidos-file";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/eidos-file-data-grid.d.ts
interface EidosFileDataGridProps {
  source: EidosFileEditorDataSource;
  table: EidosFileTableSnapshot;
  view?: EidosFileViewInfo;
  search?: string;
  disabled?: boolean;
  reloadToken?: number;
  propertyField?: EidosFileFieldInfo | null;
  onMutation?: (result: EidosFileRowMutationResult) => void;
  onDeleteRows?: (ranges: EidosFileRowRange[], query: EidosFileRowQuery) => Promise<void>;
  onSnapshot?: (snapshot: EidosFileSnapshot) => void;
  onFieldOpen?: (field: EidosFileFieldInfo) => void;
  onFieldClose?: () => void;
  onFieldAdd?: (position?: number) => void;
  onEditFormula?: (field: EidosFileFieldInfo) => void;
  onEditLookup?: (field: EidosFileFieldInfo) => void;
  onError?: (error: unknown) => void;
}
/**
 * Convenience adapter for hosts that expose the public EidosFileEditorDataSource.
 * It keeps paging and mutations outside React while rendering the exact shared
 * Desktop Grid component.
 */
declare function EidosFileDataGrid({
  source,
  table,
  view,
  search,
  disabled,
  reloadToken,
  propertyField,
  onMutation,
  onDeleteRows,
  onSnapshot,
  onFieldOpen,
  onFieldClose,
  onFieldAdd,
  onEditFormula,
  onEditLookup,
  onError
}: EidosFileDataGridProps): _$react_jsx_runtime0.JSX.Element;
//#endregion
export { EidosFileDataGrid, EidosFileDataGridProps };
```

## ./eidos-file-derived-field-editor

```ts
import { EidosFileFieldInfo, EidosFileFormulaPreview, EidosFileFormulaPreviewInput, EidosFileTableSnapshot } from "@eidos.space/eidos-file";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/eidos-file-derived-field-editor.d.ts
declare function EidosFileFormulaEditorPopover({
  field,
  fields,
  open,
  onOpenChange,
  onPreview,
  onSave
}: {
  field: EidosFileFieldInfo | null;
  fields: EidosFileFieldInfo[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPreview?: (input: EidosFileFormulaPreviewInput) => Promise<EidosFileFormulaPreview>;
  onSave: (property: Record<string, unknown>) => Promise<void> | void;
}): _$react_jsx_runtime0.JSX.Element;
declare function EidosFileLookupEditorPopover({
  field,
  fields,
  tables,
  open,
  onOpenChange,
  onSave
}: {
  field: EidosFileFieldInfo | null;
  fields: EidosFileFieldInfo[];
  tables: EidosFileTableSnapshot[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (property: Record<string, unknown>) => Promise<void> | void;
}): _$react_jsx_runtime0.JSX.Element;
//#endregion
export { EidosFileFormulaEditorPopover, EidosFileLookupEditorPopover };
```

## ./eidos-file-editor-chrome

```ts
import { n as EidosFilePlugin, o as EidosFileViewPluginContribution } from "./plugin-DL7-hwpu.mjs";
import { EidosFileTableInfo, EidosFileViewInfo } from "@eidos.space/eidos-file";
import * as _$react from "react";
import { HTMLAttributes, ReactNode } from "react";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/eidos-file-editor-chrome.d.ts
declare const EidosFileEditorRoot: _$react.ForwardRefExoticComponent<HTMLAttributes<HTMLDivElement> & _$react.RefAttributes<HTMLDivElement>>;
declare const EidosFileEditorWorkbar: _$react.ForwardRefExoticComponent<HTMLAttributes<HTMLDivElement> & _$react.RefAttributes<HTMLDivElement>>;
declare const EidosFileEditorContent: _$react.ForwardRefExoticComponent<HTMLAttributes<HTMLDivElement> & _$react.RefAttributes<HTMLDivElement>>;
declare function EidosFileViewTypeIcon({
  type,
  className,
  viewTypes
}: {
  type: string;
  className?: string;
  viewTypes?: Readonly<Record<string, EidosFileViewPluginContribution>>;
}): _$react_jsx_runtime0.JSX.Element;
declare function EidosFileViewTabStrip({
  views,
  activeViewId,
  disabled,
  plugins,
  afterTabs,
  onSelect,
  renderTab
}: {
  views: EidosFileViewInfo[];
  activeViewId?: string | null;
  disabled?: boolean;
  plugins?: readonly EidosFilePlugin[];
  afterTabs?: ReactNode;
  onSelect: (viewId: string) => void;
  renderTab?: (view: EidosFileViewInfo, tab: ReactNode) => ReactNode;
}): _$react_jsx_runtime0.JSX.Element;
declare function EidosFileSheetTabStrip({
  tables,
  activeTableId,
  disabled,
  status,
  createAction,
  onSelect,
  renderTab
}: {
  tables: EidosFileTableInfo[];
  activeTableId: string | null;
  disabled?: boolean;
  status?: ReactNode;
  createAction?: ReactNode;
  onSelect: (tableId: string) => void;
  renderTab?: (table: EidosFileTableInfo, tab: ReactNode) => ReactNode;
}): _$react_jsx_runtime0.JSX.Element;
//#endregion
export { EidosFileEditorContent, EidosFileEditorRoot, EidosFileEditorWorkbar, EidosFileSheetTabStrip, EidosFileViewTabStrip, EidosFileViewTypeIcon };
```

## ./eidos-file-editor-view

```ts
import { S as builtInEidosFileViewRenderers, _ as EidosFileViewRenderer, b as EidosFileViewSelection, d as EidosFileEditorView, f as EidosFileEditorViewProps, g as EidosFileViewCommand, h as EidosFileViewCapabilities, m as EidosFileUnsupportedView, p as EidosFileGridRenderer, u as EidosFileCommandContext, v as EidosFileViewRendererProps, x as EidosFileViewState, y as EidosFileViewRendererRegistry } from "./plugin-DL7-hwpu.mjs";
export { EidosFileCommandContext, EidosFileEditorView, EidosFileEditorViewProps, EidosFileGridRenderer, EidosFileUnsupportedView, EidosFileViewCapabilities, EidosFileViewCommand, EidosFileViewRenderer, EidosFileViewRendererProps, EidosFileViewRendererRegistry, EidosFileViewSelection, EidosFileViewState, builtInEidosFileViewRenderers };
```

## ./eidos-file-error-message

```ts
//#region src/eidos-file-error-message.d.ts
declare function eidosFileErrorMessage(error: unknown, fallback: string): string;
//#endregion
export { eidosFileErrorMessage };
```

## ./eidos-file-field-create-popover

```ts
import { CreateEidosFileFieldInput, EidosFileFormulaPreview, EidosFileFormulaPreviewInput, EidosFileTableSnapshot } from "@eidos.space/eidos-file";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/eidos-file-field-create-popover.d.ts
interface EidosFileFieldCreatePopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: EidosFileTableSnapshot;
  tables: EidosFileTableSnapshot[];
  disabled?: boolean;
  onCreate: (field: CreateEidosFileFieldInput) => Promise<void> | void;
  onPreviewFormula?: (input: EidosFileFormulaPreviewInput) => Promise<EidosFileFormulaPreview>;
}
declare function EidosFileFieldCreatePopover({
  open,
  onOpenChange,
  table,
  tables,
  disabled,
  onCreate,
  onPreviewFormula
}: EidosFileFieldCreatePopoverProps): _$react_jsx_runtime0.JSX.Element;
//#endregion
export { EidosFileFieldCreatePopover, EidosFileFieldCreatePopoverProps };
```

## ./eidos-file-field-type-picker

```ts
import { CreateEidosFileFieldInput } from "@eidos.space/eidos-file";
import { ComponentType } from "react";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/eidos-file-field-type-picker.d.ts
type EidosFileCreatableFieldType = CreateEidosFileFieldInput["type"];
interface EidosFileFieldTypeOption {
  value: EidosFileCreatableFieldType;
  label: string;
  description: string;
  keywords: string[];
  icon: ComponentType<{
    className?: string;
  }>;
}
interface EidosFileFieldTypeGroup {
  label: string;
  options: EidosFileFieldTypeOption[];
}
declare const EIDOS_FILE_FIELD_TYPE_GROUPS: EidosFileFieldTypeGroup[];
declare function EidosFileFieldTypePicker({
  value,
  onChange,
  disabled
}: {
  value: EidosFileCreatableFieldType;
  onChange: (value: EidosFileCreatableFieldType) => void;
  disabled?: boolean;
}): _$react_jsx_runtime0.JSX.Element;
//#endregion
export { EIDOS_FILE_FIELD_TYPE_GROUPS, EidosFileCreatableFieldType, EidosFileFieldTypePicker };
```

## ./eidos-file-formula-composer

```ts
import { n as EidosFileFormulaComposerProps, r as EidosFileFormulaInputRef, t as EidosFileFormulaComposer } from "./eidos-file-formula-composer-HASH.mjs";
export { EidosFileFormulaComposer, EidosFileFormulaComposerProps, EidosFileFormulaInputRef };
```

## ./eidos-file-gallery-view

```ts
import { EidosFileFieldInfo, EidosFileRelationValue, EidosFileRow, EidosFileRowMutationResult, EidosFileRowPage, EidosFileSqlPrimitive, EidosFileTableSnapshot, EidosFileViewInfo } from "@eidos.space/eidos-file";
import * as _$react from "react";
import { ReactNode } from "react";

//#region src/eidos-file-gallery-view.d.ts
declare const EidosFileGalleryView: _$react.NamedExoticComponent<{
  table: EidosFileTableSnapshot;
  view: EidosFileViewInfo;
  disabled?: boolean;
  reloadToken?: number;
  searchResultIndex?: number | null;
  loadPage: (offset: number, limit: number, totalHint?: number, cursor?: string) => Promise<EidosFileRowPage>;
  loadRow?: (rowId: string) => Promise<EidosFileRow | null>;
  onCellEdit?: (row: EidosFileRow, field: EidosFileFieldInfo, value: EidosFileSqlPrimitive) => Promise<EidosFileRowMutationResult>;
  onImportFiles?: () => Promise<string[]>;
  onImportDroppedFiles?: (files: File[]) => Promise<string[]>;
  onSearchRelation?: (field: EidosFileFieldInfo, query: string) => Promise<EidosFileRelationValue[]>;
  onDeleteRow?: (row: EidosFileRow) => Promise<void>;
  onOpenFile?: (path: string) => void;
  onRevealFile?: (path: string) => Promise<void> | void;
  onOpenRecordInTab?: (row: EidosFileRow) => void;
  onRowCountChange?: (rowCount: number | null) => void;
  onError?: (error: unknown) => void;
  sidePanel?: ReactNode;
}>;
//#endregion
export { EidosFileGalleryView };
```

## ./eidos-file-kanban-view

```ts
import { EidosFileFieldInfo, EidosFileRelationValue, EidosFileRow, EidosFileRowGroupCount, EidosFileRowMutationResult, EidosFileRowPage, EidosFileSqlPrimitive, EidosFileTableSnapshot, EidosFileViewInfo } from "@eidos.space/eidos-file";
import * as _$react from "react";
import { ReactNode } from "react";

//#region src/eidos-file-kanban-view.d.ts
declare const EidosFileKanbanView: _$react.NamedExoticComponent<{
  table: EidosFileTableSnapshot;
  view: EidosFileViewInfo;
  disabled?: boolean;
  reloadToken?: number;
  searchResultIndex?: number | null;
  loadGroupCounts: (field: EidosFileFieldInfo) => Promise<EidosFileRowGroupCount[]>;
  loadGroupPage: (field: EidosFileFieldInfo, value: string | null, offset: number, limit: number, totalHint: number, cursor?: string) => Promise<EidosFileRowPage>;
  loadRow?: (rowId: string) => Promise<EidosFileRow | null>;
  onCellEdit: (row: EidosFileRow, field: EidosFileFieldInfo, value: EidosFileSqlPrimitive) => Promise<EidosFileRowMutationResult>;
  onAddRow: (field: EidosFileFieldInfo, value: string | null, title: string) => Promise<EidosFileRowMutationResult>;
  onDeleteRow?: (row: EidosFileRow) => Promise<void>;
  onImportFiles?: () => Promise<string[]>;
  onImportDroppedFiles?: (files: File[]) => Promise<string[]>;
  onSearchRelation?: (field: EidosFileFieldInfo, query: string) => Promise<EidosFileRelationValue[]>;
  onOpenFile?: (path: string) => void;
  onRevealFile?: (path: string) => Promise<void> | void;
  onOpenRecordInTab?: (row: EidosFileRow) => void;
  onRowCountChange?: (rowCount: number | null) => void;
  onError?: (error: unknown) => void;
  sidePanel?: ReactNode;
}>;
//#endregion
export { EidosFileKanbanView };
```

## ./eidos-file-query-toolbar

```ts
import { EidosFileFieldInfo, EidosFileFilterGroup, EidosFileSort } from "@eidos.space/eidos-file";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/eidos-file-query-toolbar.d.ts
declare function EidosFileQueryToolbar({
  fields,
  filter,
  sorts,
  search,
  disabled,
  focusSearchToken,
  searchResultCount,
  searchResultIndex,
  onSearchChange,
  onNavigateSearch,
  onFilterChange,
  onSortsChange
}: {
  fields: EidosFileFieldInfo[];
  filter: EidosFileFilterGroup | null;
  sorts: EidosFileSort[];
  search: string;
  disabled?: boolean;
  focusSearchToken?: number;
  searchResultCount?: number | null;
  searchResultIndex?: number | null;
  onSearchChange: (search: string) => void;
  onNavigateSearch?: (direction: "next" | "previous") => void;
  onFilterChange: (filter: EidosFileFilterGroup | null) => Promise<void> | void;
  onSortsChange: (sorts: EidosFileSort[]) => Promise<void> | void;
}): _$react_jsx_runtime0.JSX.Element;
//#endregion
export { EidosFileQueryToolbar };
```

## ./eidos-file-record-card

```ts
import { n as EidosFileRecordCardLayout } from "./eidos-file-record-card-layout-HASH.mjs";
import { EidosFileFieldInfo, EidosFileRow, EidosFileViewInfo } from "@eidos.space/eidos-file";
import * as _$react from "react";
import { AriaRole } from "react";

//#region src/eidos-file-record-card.d.ts
declare const EidosFileRecordCard: _$react.NamedExoticComponent<{
  row: EidosFileRow;
  fields: EidosFileFieldInfo[];
  view: EidosFileViewInfo;
  layout?: EidosFileRecordCardLayout;
  compact?: boolean;
  onOpen: (row: EidosFileRow) => void;
  onDelete?: (row: EidosFileRow) => void;
  moveOptions?: Array<{
    id: string;
    label: string;
    disabled?: boolean;
  }>;
  disabledMoveOptionId?: string;
  moveDisabled?: boolean;
  onMove?: (row: EidosFileRow, targetId: string) => void;
  role?: AriaRole;
  positionInSet?: number;
  setSize?: number;
  focused?: boolean;
}>;
//#endregion
export { EidosFileRecordCard };
```

## ./eidos-file-record-card-layout

```ts
import { a as isEidosFileRecordCoverField, i as eidosFileRecordCardPageProjection, n as EidosFileRecordCardLayout, o as selectEidosFileRecordCardFields, r as createEidosFileRecordCardLayout, t as EidosFileRecordCardFieldLayout } from "./eidos-file-record-card-layout-HASH.mjs";
export { EidosFileRecordCardFieldLayout, EidosFileRecordCardLayout, createEidosFileRecordCardLayout, eidosFileRecordCardPageProjection, isEidosFileRecordCoverField, selectEidosFileRecordCardFields };
```

## ./eidos-file-record-delete-dialog

```ts
import { EidosFileRow } from "@eidos.space/eidos-file";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/eidos-file-record-delete-dialog.d.ts
declare function EidosFileRecordDeleteDialog({
  row,
  disabled,
  onOpenChange,
  onDelete,
  onError
}: {
  row: EidosFileRow | null;
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (row: EidosFileRow) => Promise<void>;
  onError?: (error: unknown) => void;
}): _$react_jsx_runtime0.JSX.Element;
//#endregion
export { EidosFileRecordDeleteDialog };
```

## ./eidos-file-row-window

```ts
import { EidosFileRow, EidosFileRowPage } from "@eidos.space/eidos-file";

//#region src/eidos-file-row-window.d.ts
type EidosFileRowWindowMergeMode = "append" | "prepend" | "replace";
interface EidosFileRowWindow {
  rows: EidosFileRow[];
  startOffset: number;
  total: number;
  nextCursor?: string;
}
interface EidosFileRowWindowRequest {
  mode: EidosFileRowWindowMergeMode;
  offset: number;
}
declare function rowFromWindow(window: EidosFileRowWindow, absoluteIndex: number): EidosFileRow | undefined;
declare function mergeRowWindowPage(current: EidosFileRowWindow, page: EidosFileRowPage, mode: EidosFileRowWindowMergeMode, maxRows: number): EidosFileRowWindow;
declare function requestForRowWindow(window: EidosFileRowWindow, visibleStart: number, visibleEnd: number, pageSize: number): EidosFileRowWindowRequest | null;
declare function requestForPrefetchedRowWindow(window: EidosFileRowWindow, visibleStart: number, visibleEnd: number, pageSize: number, prefetchRows: number): EidosFileRowWindowRequest | null;
//#endregion
export { EidosFileRowWindow, EidosFileRowWindowMergeMode, EidosFileRowWindowRequest, mergeRowWindowPage, requestForPrefetchedRowWindow, requestForRowWindow, rowFromWindow };
```

## ./eidos-file-sheet-create-popover

```ts
import { EidosFileCsvImportPopoverProps } from "./eidos-file-csv-import-popover.mjs";
import { CreateEidosFileTableInput } from "@eidos.space/eidos-file";
import { ReactNode } from "react";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/eidos-file-sheet-create-popover.d.ts
type SheetCsvImportProps = Omit<EidosFileCsvImportPopoverProps, "onImported" | "triggerVariant">;
declare function EidosFileSheetCreatePopover({
  disabled,
  csvImportProps,
  importAction,
  onCreate
}: {
  disabled?: boolean;
  csvImportProps?: SheetCsvImportProps;
  importAction?: ReactNode;
  onCreate: (table: CreateEidosFileTableInput) => Promise<void> | void;
}): _$react_jsx_runtime0.JSX.Element;
//#endregion
export { EidosFileSheetCreatePopover };
```

## ./eidos-file-sheet-tabs

```ts
import { EidosFileTableInfo } from "@eidos.space/eidos-file";
import { ReactNode } from "react";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/eidos-file-sheet-tabs.d.ts
interface EidosFileSheetTabActions {
  canDelete: boolean;
  delete: () => void;
  deleteDisabledReason?: string;
  disabled: boolean;
  rename: () => void;
}
type EidosFileSheetTabRenderer = (table: EidosFileTableInfo, tab: ReactNode, actions: EidosFileSheetTabActions) => ReactNode;
interface EidosFileSheetTabsProps {
  tables: EidosFileTableInfo[];
  activeTableId: string | null;
  disabled?: boolean;
  status?: ReactNode;
  createAction?: ReactNode;
  onSelect: (tableId: string) => void;
  onRename?: (table: EidosFileTableInfo, name: string) => Promise<void> | void;
  onDelete?: (table: EidosFileTableInfo) => Promise<void> | void;
  renderTab?: EidosFileSheetTabRenderer;
}
declare function EidosFileSheetTabs({
  tables,
  activeTableId,
  disabled,
  status,
  createAction,
  onSelect,
  onRename,
  onDelete,
  renderTab
}: EidosFileSheetTabsProps): _$react_jsx_runtime0.JSX.Element;
//#endregion
export { EidosFileSheetTabActions, EidosFileSheetTabRenderer, EidosFileSheetTabs, EidosFileSheetTabsProps };
```

## ./eidos-file-view-selector

```ts
import { EidosFileFieldInfo, EidosFileViewInfo, UpdateEidosFileViewInput } from "@eidos.space/eidos-file";
import { ReactNode } from "react";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/eidos-file-view-selector.d.ts
interface EidosFileExternalViewContribution {
  id: string;
  displayName: string;
  description?: string | null;
  extensionDisplayName?: string | null;
  packageId?: string;
  contentDigest?: string;
  permissionHash?: string;
}
type Panel = "list" | "create" | "manage" | "delete";
interface EidosFileViewSelectorRequest {
  anchorRect: Pick<DOMRect, "height" | "left" | "top" | "width">;
  focusName?: boolean;
  panel: Extract<Panel, "manage" | "delete">;
  requestId: number;
  viewId: string;
}
type EidosFileBuiltInViewType = "grid" | "gallery" | "kanban";
declare const EIDOS_FILE_EXTENSION_VIEW_PREFIX = "extension:";
declare function eidosFileExtensionViewType(contributionId: string): string;
declare function eidosFileExtensionContributionId(type: string): string | null;
declare function isEidosFileBuiltInViewType(type: string): type is EidosFileBuiltInViewType;
declare function EidosFileViewSelector({
  views,
  extensionViews,
  fields,
  activeView,
  disabled,
  onSelect,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
  onReorder,
  onUpdate,
  viewAction,
  triggerMode,
  request
}: {
  views: EidosFileViewInfo[];
  extensionViews?: EidosFileExternalViewContribution[];
  fields: EidosFileFieldInfo[];
  activeView?: EidosFileViewInfo;
  disabled?: boolean;
  onSelect: (viewId: string) => void;
  onCreate: (name: string, type: string) => Promise<void>;
  onRename: (viewId: string, name: string) => Promise<void>;
  onDuplicate: (viewId: string) => Promise<void>;
  onDelete: (viewId: string) => Promise<void>;
  onReorder: (viewIds: string[]) => Promise<void>;
  onUpdate: (viewId: string, changes: UpdateEidosFileViewInput) => Promise<void>;
  viewAction?: ReactNode;
  triggerMode?: "current" | "create" | "manage" | "context";
  request?: EidosFileViewSelectorRequest | null;
}): _$react_jsx_runtime0.JSX.Element;
//#endregion
export { EIDOS_FILE_EXTENSION_VIEW_PREFIX, EidosFileBuiltInViewType, EidosFileExternalViewContribution, EidosFileViewSelector, EidosFileViewSelectorRequest, eidosFileExtensionContributionId, eidosFileExtensionViewType, isEidosFileBuiltInViewType };
```

## ./eidos-file-view-tabs

```ts
import { EidosFileViewSelector } from "./eidos-file-view-HASH.mjs";
import { EidosFileViewInfo } from "@eidos.space/eidos-file";
import { ComponentProps, ReactNode } from "react";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/eidos-file-view-tabs.d.ts
interface EidosFileViewTabActions {
  canDelete: boolean;
  configure: () => void;
  delete: () => void;
  deleteDisabledReason?: string;
  disabled: boolean;
  rename: () => void;
}
type EidosFileViewTabRenderer = (view: EidosFileViewInfo, tab: ReactNode, actions: EidosFileViewTabActions) => ReactNode;
type EidosFileViewTabsProps = Omit<ComponentProps<typeof EidosFileViewSelector>, "request" | "triggerMode"> & {
  renderTab?: EidosFileViewTabRenderer;
};
declare function EidosFileViewTabs({
  renderTab,
  ...props
}: EidosFileViewTabsProps): _$react_jsx_runtime0.JSX.Element;
//#endregion
export { EidosFileViewTabActions, EidosFileViewTabRenderer, EidosFileViewTabs, EidosFileViewTabsProps };
```

## ./eidos-file-virtual-scroll

```ts
import { Rect, ScrollToOptions, VirtualItem, Virtualizer } from "@tanstack/react-virtual";

//#region src/eidos-file-virtual-scroll.d.ts
declare const EIDOS_FILE_VIRTUAL_SCROLL_MAX_SIZE = 12000000;
declare const EIDOS_FILE_VIRTUAL_SCROLL_MAX_ITEMS = 2048;
interface EidosFileVirtualWindow {
  start: number;
  count: number;
}
declare function eidosFileVirtualPhysicalSize(logicalSize: number): number;
declare function eidosFileVirtualWindowForOffset(totalCount: number, estimatedStride: number, logicalOffset: number): EidosFileVirtualWindow;
declare function eidosFileVirtualLogicalOffset(physicalOffset: number, logicalSize: number, viewportSize: number): number;
declare function eidosFileVirtualPhysicalOffset(logicalOffset: number, logicalSize: number, viewportSize: number): number;
declare function eidosFileVirtualItemOffset(logicalItemOffset: number, physicalScrollOffset: number, logicalSize: number, viewportSize: number): number;
interface EidosFileBoundedVirtualizerOptions<TScrollElement extends HTMLElement, TItemElement extends Element> {
  count: number;
  getScrollElement: () => TScrollElement | null;
  estimatedItemSize: number;
  getItemKey: (globalIndex: number) => number | string | bigint;
  gap?: number;
  initialRect: Rect;
  overscan?: number;
  useAnimationFrameWithResizeObserver?: boolean;
}
interface EidosFileBoundedVirtualizerResult<TScrollElement extends HTMLElement, TItemElement extends Element> {
  virtualizer: Virtualizer<TScrollElement, TItemElement>;
  virtualItems: VirtualItem[];
  logicalSize: number;
  physicalSize: number;
  physicalScrollOffset: number;
  logicalScrollOffset: number;
  localScrollOffset: number;
  viewportSize: number;
  measurementCount: number;
  globalIndex: (localIndex: number) => number;
  itemOffset: (item: VirtualItem) => number;
  scrollToIndex: (globalIndex: number, options?: ScrollToOptions) => void;
}
declare function resetEidosFileVirtualizerMeasurements<TScrollElement extends HTMLElement, TItemElement extends Element>(virtualizer: Virtualizer<TScrollElement, TItemElement>): void;
declare function useEidosFileBoundedVirtualizer<TScrollElement extends HTMLElement, TItemElement extends Element>({
  count,
  getScrollElement,
  estimatedItemSize,
  getItemKey,
  gap,
  initialRect,
  overscan,
  useAnimationFrameWithResizeObserver
}: EidosFileBoundedVirtualizerOptions<TScrollElement, TItemElement>): EidosFileBoundedVirtualizerResult<TScrollElement, TItemElement>;
//#endregion
export { EIDOS_FILE_VIRTUAL_SCROLL_MAX_ITEMS, EIDOS_FILE_VIRTUAL_SCROLL_MAX_SIZE, EidosFileBoundedVirtualizerResult, EidosFileVirtualWindow, eidosFileVirtualItemOffset, eidosFileVirtualLogicalOffset, eidosFileVirtualPhysicalOffset, eidosFileVirtualPhysicalSize, eidosFileVirtualWindowForOffset, resetEidosFileVirtualizerMeasurements, useEidosFileBoundedVirtualizer };
```

## ./platform

```ts
import { EidosFileUIHost } from "./context.mjs";
import { b as EidosFileViewSelection, f as EidosFileEditorViewProps, g as EidosFileViewCommand, x as EidosFileViewState } from "./plugin-DL7-hwpu.mjs";
import { EidosFileDataSource, EidosFileSession, EidosFileSessionState, EidosFileSnapshot } from "@eidos.space/eidos-file";
import { CSSProperties, ReactNode } from "react";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/platform.d.ts
type EidosFileReactTrust = "trusted-react-view";
interface EidosFileReactContextValue {
  session: EidosFileSession;
  state: EidosFileSessionState;
  source: EidosFileDataSource | null;
  snapshot: EidosFileSnapshot | null;
  trust: EidosFileReactTrust;
}
interface EidosFileProviderProps extends Partial<EidosFileUIHost> {
  session: EidosFileSession;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}
/**
 * Connects a host-owned session to React. Custom views are trusted application
 * code, but they receive only the public data source and view context.
 */
declare function EidosFileProvider({
  session,
  children,
  className,
  style,
  themeName,
  resolveAssetUrl,
  resolveFilePreview
}: EidosFileProviderProps): _$react_jsx_runtime0.JSX.Element;
declare function useEidosFile(): EidosFileReactContextValue;
declare function useEidosFileSession(): EidosFileSession;
interface EidosFileViewHostProps extends Omit<EidosFileEditorViewProps, "source" | "table" | "view" | "selection" | "onSelectionChange" | "state" | "onStateChange" | "capabilities" | "onSnapshot" | "onMutation"> {
  tableId?: string;
  viewId?: string;
  commands?: readonly EidosFileViewCommand[];
  selection?: EidosFileViewSelection;
  onSelectionChange?: (selection: EidosFileViewSelection) => void;
  state?: EidosFileViewState;
  onStateChange?: (state: EidosFileViewState) => void;
  onSnapshot?: EidosFileEditorViewProps["onSnapshot"];
  onMutation?: EidosFileEditorViewProps["onMutation"];
  renderEmpty?: (state: EidosFileSessionState) => ReactNode;
}
/** Renders the selected built-in or host-registered view from session state. */
declare function EidosFileViewHost({
  tableId,
  viewId,
  commands,
  selection: controlledSelection,
  onSelectionChange,
  state: controlledViewState,
  onStateChange,
  onSnapshot,
  onMutation,
  renderEmpty,
  disabled,
  ...props
}: EidosFileViewHostProps): string | number | boolean | _$react_jsx_runtime0.JSX.Element | Iterable<ReactNode> | null | undefined;
//#endregion
export { EidosFileProvider, EidosFileProviderProps, EidosFileReactContextValue, EidosFileReactTrust, EidosFileViewHost, EidosFileViewHostProps, useEidosFile, useEidosFileSession };
```

## ./plugin

```ts
import { a as EidosFilePluginSlot, c as defineEidosFilePlugin, i as EidosFilePluginRegistry, l as defineEidosFileView, n as EidosFilePlugin, o as EidosFileViewPluginContribution, r as EidosFilePluginContext, s as createEidosFilePluginRegistry, t as EidosFileActionPluginContribution } from "./plugin-DL7-hwpu.mjs";
export { EidosFileActionPluginContribution, EidosFilePlugin, EidosFilePluginContext, EidosFilePluginRegistry, EidosFilePluginSlot, EidosFileViewPluginContribution, createEidosFilePluginRegistry, defineEidosFilePlugin, defineEidosFileView };
```

## ./plugins/csv-import

```ts
import { r as EidosFilePluginContext } from "../plugin-DL7-hwpu.mjs";
import { EidosFileCsvImportOptions, EidosFileCsvImportPlan, EidosFileCsvImportResult, EidosFileSnapshot } from "@eidos.space/eidos-file";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/plugins/csv-import.d.ts
interface EidosFileCsvImportSource {
  id: string;
  fileName: string;
}
interface EidosFileCsvImportAdapter {
  pickFile(): Promise<EidosFileCsvImportSource | null>;
  preview(source: EidosFileCsvImportSource, options: EidosFileCsvImportOptions): Promise<EidosFileCsvImportPlan>;
  import(source: EidosFileCsvImportSource, options: EidosFileCsvImportOptions): Promise<{
    snapshot: EidosFileSnapshot;
    result: EidosFileCsvImportResult;
  }>;
  release?(source: EidosFileCsvImportSource): void;
}
interface EidosFileCsvImportPluginOptions {
  id?: string;
  label?: string;
  order?: number;
  copy?: Partial<EidosFileCsvImportCopy>;
}
interface EidosFileCsvImportCopy {
  actionAriaLabel: string;
  actionLabel: string;
  cancel: string;
  chooseAnother: string;
  choosePrompt: string;
  dialogTitle: string;
  fieldName: string;
  fieldType: string;
  fileSummary: string;
  importRows: string;
  importing: string;
  localOnly: string;
  parsing: string;
  preview: string;
  tableName: string;
  titleType: string;
  typeCheckbox: string;
  typeDate: string;
  typeDatetime: string;
  typeNumber: string;
  typeText: string;
  typeUrl: string;
  unableToImport: string;
  unableToRead: string;
}
declare function createEidosFileCsvImportPlugin(adapter: EidosFileCsvImportAdapter, options?: EidosFileCsvImportPluginOptions): {
  id: string;
  actions: {
    id: string;
    slot: "sheet-create";
    order: number;
    render: (context: EidosFilePluginContext) => _$react_jsx_runtime0.JSX.Element;
  }[];
};
//#endregion
export { EidosFileCsvImportAdapter, EidosFileCsvImportCopy, EidosFileCsvImportPluginOptions, EidosFileCsvImportSource, createEidosFileCsvImportPlugin };
```

## ./plugins/gallery

```ts
import { v as EidosFileViewRendererProps } from "../plugin-DL7-hwpu.mjs";
import * as _$react from "react";
import * as _$lucide_react0 from "lucide-react";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/plugins/gallery.d.ts
declare function EidosFileGalleryRenderer(props: EidosFileViewRendererProps): _$react_jsx_runtime0.JSX.Element | null;
declare const eidosFileGalleryPlugin: {
  id: string;
  views: {
    type: string;
    label: string;
    description: string;
    icon: _$react.ForwardRefExoticComponent<Omit<_$lucide_react0.LucideProps, "ref"> & _$react.RefAttributes<SVGSVGElement>>;
    renderer: typeof EidosFileGalleryRenderer;
    create: {
      defaultName: string;
      properties: () => {
        cardSize: string;
        hideEmptyFields: boolean;
      };
    };
  }[];
};
//#endregion
export { eidosFileGalleryPlugin };
```

## ./plugins/kanban

```ts
import { v as EidosFileViewRendererProps } from "../plugin-DL7-hwpu.mjs";
import { EidosFileFieldInfo } from "@eidos.space/eidos-file";
import * as _$react from "react";
import * as _$lucide_react0 from "lucide-react";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/plugins/kanban.d.ts
declare function EidosFileKanbanRenderer(props: EidosFileViewRendererProps): _$react_jsx_runtime0.JSX.Element | null;
declare const eidosFileKanbanPlugin: {
  id: string;
  views: {
    type: string;
    label: string;
    description: string;
    icon: _$react.ForwardRefExoticComponent<Omit<_$lucide_react0.LucideProps, "ref"> & _$react.RefAttributes<SVGSVGElement>>;
    renderer: typeof EidosFileKanbanRenderer;
    create: {
      defaultName: string;
      isAvailable: (fields: readonly EidosFileFieldInfo[]) => boolean;
      properties: (fields: readonly EidosFileFieldInfo[]) => {
        groupByField?: string | undefined;
        cardSize: string;
        hideEmptyFields: boolean;
      };
    };
  }[];
};
//#endregion
export { eidosFileKanbanPlugin };
```

## ./ui/alert-dialog

```ts
import * as React$1 from "react";
import { AlertDialog as AlertDialog$1 } from "radix-ui";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/ui/alert-dialog.d.ts
declare const AlertDialog: React$1.FC<AlertDialog$1.AlertDialogProps>;
declare const AlertDialogTrigger: React$1.ForwardRefExoticComponent<AlertDialog$1.AlertDialogTriggerProps & React$1.RefAttributes<HTMLButtonElement>>;
declare const AlertDialogPortal: React$1.FC<AlertDialog$1.AlertDialogPortalProps>;
declare const AlertDialogOverlay: React$1.ForwardRefExoticComponent<Omit<AlertDialog$1.AlertDialogOverlayProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;
declare const AlertDialogContent: React$1.ForwardRefExoticComponent<Omit<AlertDialog$1.AlertDialogContentProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;
declare const AlertDialogHeader: {
  ({
    className,
    ...props
  }: React$1.HTMLAttributes<HTMLDivElement>): _$react_jsx_runtime0.JSX.Element;
  displayName: string;
};
declare const AlertDialogFooter: {
  ({
    className,
    ...props
  }: React$1.HTMLAttributes<HTMLDivElement>): _$react_jsx_runtime0.JSX.Element;
  displayName: string;
};
declare const AlertDialogTitle: React$1.ForwardRefExoticComponent<Omit<AlertDialog$1.AlertDialogTitleProps & React$1.RefAttributes<HTMLHeadingElement>, "ref"> & React$1.RefAttributes<HTMLHeadingElement>>;
declare const AlertDialogDescription: React$1.ForwardRefExoticComponent<Omit<AlertDialog$1.AlertDialogDescriptionProps & React$1.RefAttributes<HTMLParagraphElement>, "ref"> & React$1.RefAttributes<HTMLParagraphElement>>;
declare const AlertDialogAction: React$1.ForwardRefExoticComponent<Omit<AlertDialog$1.AlertDialogActionProps & React$1.RefAttributes<HTMLButtonElement>, "ref"> & React$1.RefAttributes<HTMLButtonElement>>;
declare const AlertDialogCancel: React$1.ForwardRefExoticComponent<Omit<AlertDialog$1.AlertDialogCancelProps & React$1.RefAttributes<HTMLButtonElement>, "ref"> & React$1.RefAttributes<HTMLButtonElement>>;
//#endregion
export { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogOverlay, AlertDialogPortal, AlertDialogTitle, AlertDialogTrigger };
```

## ./ui/dropdown-menu

```ts
import * as React$1 from "react";
import { DropdownMenu as DropdownMenu$1 } from "radix-ui";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/ui/dropdown-menu.d.ts
declare const DropdownMenu: React$1.FC<DropdownMenu$1.DropdownMenuProps>;
declare const DropdownMenuTrigger: React$1.ForwardRefExoticComponent<DropdownMenu$1.DropdownMenuTriggerProps & React$1.RefAttributes<HTMLButtonElement>>;
declare const DropdownMenuGroup: React$1.ForwardRefExoticComponent<DropdownMenu$1.DropdownMenuGroupProps & React$1.RefAttributes<HTMLDivElement>>;
declare const DropdownMenuPortal: React$1.FC<DropdownMenu$1.DropdownMenuPortalProps>;
declare const DropdownMenuSub: React$1.FC<DropdownMenu$1.DropdownMenuSubProps>;
declare const DropdownMenuRadioGroup: React$1.ForwardRefExoticComponent<DropdownMenu$1.DropdownMenuRadioGroupProps & React$1.RefAttributes<HTMLDivElement>>;
declare const DropdownMenuSubTrigger: React$1.ForwardRefExoticComponent<Omit<DropdownMenu$1.DropdownMenuSubTriggerProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & {
  inset?: boolean;
} & React$1.RefAttributes<HTMLDivElement>>;
declare const DropdownMenuSubContent: React$1.ForwardRefExoticComponent<Omit<DropdownMenu$1.DropdownMenuSubContentProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;
declare const DropdownMenuContent: React$1.ForwardRefExoticComponent<Omit<DropdownMenu$1.DropdownMenuContentProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & {
  container?: HTMLElement;
} & React$1.RefAttributes<HTMLDivElement>>;
declare const DropdownMenuItem: React$1.ForwardRefExoticComponent<Omit<DropdownMenu$1.DropdownMenuItemProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & {
  inset?: boolean;
} & React$1.RefAttributes<HTMLDivElement>>;
declare const DropdownMenuCheckboxItem: React$1.ForwardRefExoticComponent<Omit<DropdownMenu$1.DropdownMenuCheckboxItemProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;
declare const DropdownMenuRadioItem: React$1.ForwardRefExoticComponent<Omit<DropdownMenu$1.DropdownMenuRadioItemProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;
declare const DropdownMenuLabel: React$1.ForwardRefExoticComponent<Omit<DropdownMenu$1.DropdownMenuLabelProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & {
  inset?: boolean;
} & React$1.RefAttributes<HTMLDivElement>>;
declare const DropdownMenuSeparator: React$1.ForwardRefExoticComponent<Omit<DropdownMenu$1.DropdownMenuSeparatorProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;
declare const DropdownMenuShortcut: {
  ({
    className,
    ...props
  }: React$1.HTMLAttributes<HTMLSpanElement>): _$react_jsx_runtime0.JSX.Element;
  displayName: string;
};
//#endregion
export { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger };
```

## ./ui/kanban

```ts
import React, { ReactNode } from "react";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";
import { DragCancelEvent, DragEndEvent, DragEndEvent as DragEndEvent$1, DragStartEvent } from "@dnd-kit/core";

//#region src/ui/kanban.d.ts
type Status = {
  id: string;
  name: string;
  color: string;
};
type KanbanBoardProps = {
  id: Status["id"];
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  role?: React.AriaRole;
  "aria-label"?: string;
};
declare const KanbanBoard: ({
  id,
  children,
  className,
  style,
  role,
  "aria-label": ariaLabel
}: KanbanBoardProps) => _$react_jsx_runtime0.JSX.Element;
type KanbanCardProps = {
  id: string;
  name: string;
  index: number;
  parent: string;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
};
declare const KanbanCard: ({
  id,
  name,
  index,
  parent,
  children,
  className,
  disabled
}: KanbanCardProps) => _$react_jsx_runtime0.JSX.Element;
type KanbanCardsProps = {
  children: ReactNode;
  className?: string;
  ref?: React.RefObject<HTMLDivElement>;
};
declare const KanbanCards: React.ForwardRefExoticComponent<Omit<KanbanCardsProps, "ref"> & React.RefAttributes<HTMLDivElement>>;
type KanbanHeaderProps = {
  children: ReactNode;
} | {
  name: Status["name"];
  color: Status["color"];
  className?: string;
};
declare const KanbanHeader: (props: KanbanHeaderProps) => string | number | boolean | _$react_jsx_runtime0.JSX.Element | Iterable<React.ReactNode> | null | undefined;
type KanbanProviderProps = {
  children: ReactNode;
  onDragEnd: (event: DragEndEvent$1) => void;
  onDragStart?: (event: DragStartEvent) => void;
  onDragCancel?: (event: DragCancelEvent) => void;
  className?: string;
};
declare const KanbanProvider: ({
  children,
  onDragEnd,
  onDragStart,
  onDragCancel,
  className
}: KanbanProviderProps) => _$react_jsx_runtime0.JSX.Element;
//#endregion
export { type DragEndEvent, KanbanBoard, KanbanBoardProps, KanbanCard, KanbanCardProps, KanbanCards, KanbanCardsProps, KanbanHeader, KanbanHeaderProps, KanbanProvider, KanbanProviderProps, Status };
```

## ./use-eidos-file-record-inspector-row

```ts
import { EidosFileRow } from "@eidos.space/eidos-file";

//#region src/use-eidos-file-record-inspector-row.d.ts
declare function useEidosFileRecordInspectorRow(loadRow?: (rowId: string) => Promise<EidosFileRow | null>): {
  inspectedRow: EidosFileRow | null;
  inspectorLoading: boolean;
  inspectorLoadError: string | null;
  openInspectorRow: (previewRow: EidosFileRow) => void;
  closeInspectorRow: () => void;
  replaceInspectorRow: (row: EidosFileRow) => void;
  retryInspectorRow: () => void;
};
//#endregion
export { useEidosFileRecordInspectorRow };
```
