# @eidos.space/eidos-file-ui API report

## .

```ts
import { a as EidosFileUIHost, c as EidosFileUIThemeName, d as EidosFileUIMessageOverrides, f as EidosFileUIMessageValues, i as EidosFileUIAssetSession, l as useEidosFileUI, n as EidosFileImagePresentationLease, o as EidosFileUIKeyboardShortcuts, p as translateEidosFileUI, r as EidosFileRelationRecordTarget, s as EidosFileUIProvider, t as AssetPresenter, u as EidosFileUILocale } from "./context-HASH.mjs";
import { EidosFileCalendarCreateMode, EidosFileCalendarFieldType, EidosFileCalendarLayout, EidosFileCalendarPage, EidosFileCalendarPageRequest, EidosFileCalendarRange, EidosFileCalendarView, eidosFileCalendarCreateMode, eidosFileCalendarCreateValue, eidosFileCalendarDateFields, eidosFileCalendarFieldType, eidosFileCalendarLayout, eidosFileCalendarRowDateKey } from "./eidos-file-calendar-view.mjs";
import { n as EidosFileCsvOperationProgressBar, r as EidosFileCsvOperationProgressBarProps, t as EidosFileCsvOperationProgress } from "./eidos-file-csv-operation-progress-HASH.mjs";
import { EidosFileCsvImportPopover, EidosFileCsvImportPopoverProps } from "./eidos-file-csv-import-popover.mjs";
import { n as EidosFileEditorDataSource, t as EidosFileDataSource } from "./data-source-HASH.mjs";
import { n as EidosFileFormulaEditorPopover, r as EidosFileLookupEditorPopover, t as EidosFileFormulaEditorAnchor } from "./eidos-file-derived-field-editor-HASH.mjs";
import { EidosFileDataGrid, EidosFileDataGridProps } from "./eidos-file-data-grid.mjs";
import { C as builtInEidosFileViewRenderers, S as EidosFileViewState, _ as EidosFileViewCommand, a as EidosFilePluginSlot, b as EidosFileViewRendererRegistry, c as defineEidosFilePlugin, d as EidosFileEditorView, f as EidosFileEditorViewProps, g as EidosFileViewCapabilities, h as EidosFileUnsupportedView, i as EidosFilePluginRegistry, l as defineEidosFileView, m as EidosFileUnsupportedQuery, n as EidosFilePlugin, o as EidosFileViewPluginContribution, p as EidosFileGridRenderer, r as EidosFilePluginContext, s as createEidosFilePluginRegistry, t as EidosFileActionPluginContribution, u as EidosFileCommandContext, v as EidosFileViewRenderer, x as EidosFileViewSelection, y as EidosFileViewRendererProps } from "./plugin-HASH.mjs";
import { a as EidosFileViewTabStrip, c as ExportEidosFileViewCsvOptions, i as EidosFileSheetTabStrip, l as exportEidosFileViewCsv, n as EidosFileEditorRoot, o as EidosFileViewTypeIcon, r as EidosFileEditorWorkbar, s as EidosFileViewCsvExport, t as EidosFileEditorContent } from "./eidos-file-editor-chrome-HASH.mjs";
import { EidosFileEditorShell, EidosFileEditorShellProps } from "./eidos-file-editor-shell.mjs";
import { EidosFileEmptyState, EidosFileEmptyStateProps, EidosFileEmptyStateTemplate } from "./eidos-file-empty-state.mjs";
import { eidosFileErrorMessage } from "./eidos-file-error-message.mjs";
import { EIDOS_FILE_FIELD_TYPE_GROUPS, EidosFileCreatableFieldType, EidosFileFieldTypeIcon, EidosFileFieldTypePicker, eidosFileFieldTypeIcon } from "./eidos-file-field-type-picker.mjs";
import { EidosFileFieldCreatePopover, EidosFileFieldCreatePopoverProps } from "./eidos-file-field-create-popover.mjs";
import { EidosFileFormEditorMode, EidosFileFormModeToolbar, EidosFileFormView } from "./eidos-file-form-view.mjs";
import { n as EidosFileFormulaComposerProps, r as EidosFileFormulaInputRef, t as EidosFileFormulaComposer } from "./eidos-file-formula-composer-HASH.mjs";
import { EidosFileGalleryView } from "./eidos-file-gallery-view.mjs";
import { EidosFileKanbanView } from "./eidos-file-kanban-view.mjs";
import { EidosFileQueryToolbar } from "./eidos-file-query-toolbar.mjs";
import { _ as nextEidosFileOptionColor, a as isEidosFileRecordCoverField, c as EIDOS_FILE_OPTION_COLORS, d as eidosFileFieldDisplaysUrl, f as eidosFileNumberProperty, g as eidosFileUrlDisplaysImage, h as eidosFileSelectOptions, i as eidosFileRecordCardPageProjection, l as EidosFileNumberProperty, m as eidosFileSelectDefaultOption, n as EidosFileRecordCardLayout, o as selectEidosFileRecordCardFields, p as eidosFileOptionColor, r as createEidosFileRecordCardLayout, s as DEFAULT_BASE_NUMBER_PROPERTY, t as EidosFileRecordCardFieldLayout, u as EidosFileSelectOption } from "./eidos-file-record-card-layout-HASH.mjs";
import { EidosFileRecordCard } from "./eidos-file-record-card.mjs";
import { EidosFileRecordDeleteDialog } from "./eidos-file-record-delete-dialog.mjs";
import { EidosFileRowWindow, EidosFileRowWindowMergeMode, EidosFileRowWindowRequest, mergeRowWindowPage, requestForPrefetchedRowWindow, requestForRowWindow, rowFromWindow } from "./eidos-file-row-window.mjs";
import { EidosFileSheetCreatePopover } from "./eidos-file-sheet-create-popover.mjs";
import { EidosFileSheetTabActions, EidosFileSheetTabRenderer, EidosFileSheetTabs, EidosFileSheetTabsProps } from "./eidos-file-sheet-tabs.mjs";
import { EidosFileViewFieldsPopover } from "./eidos-file-view-fields-popover.mjs";
import { EIDOS_FILE_EXTENSION_VIEW_PREFIX, EidosFileBuiltInViewType, EidosFileExternalViewContribution, EidosFileViewCreateOptions, EidosFileViewSelector, EidosFileViewSelectorRequest, eidosFileExtensionContributionId, eidosFileExtensionViewType, isEidosFileBuiltInViewType } from "./eidos-file-view-HASH.mjs";
import { EidosFileViewTabActions, EidosFileViewTabRenderer, EidosFileViewTabs, EidosFileViewTabsProps } from "./eidos-file-view-tabs.mjs";
import { EIDOS_FILE_VIRTUAL_SCROLL_MAX_ITEMS, EIDOS_FILE_VIRTUAL_SCROLL_MAX_SIZE, EidosFileBoundedVirtualizerResult, EidosFileVirtualWindow, eidosFileVirtualItemOffset, eidosFileVirtualLogicalOffset, eidosFileVirtualPhysicalOffset, eidosFileVirtualPhysicalSize, eidosFileVirtualWindowForOffset, resetEidosFileVirtualizerMeasurements, useEidosFileBoundedVirtualizer } from "./eidos-file-virtual-scroll.mjs";
import { EIDOS_UI_PROTOCOL, EidosUIKernel, EidosUIKernelOptions, EidosUIKernelPhase, EidosUIKernelState, EidosUISchemaIndex, OpenEidosUISourceRequest, eidosUIPresentValue, eidosUIViewQuery, eidosUIVisibleFields } from "./kernel.mjs";
import { EidosFileProvider, EidosFileProviderProps, EidosFileReactContextValue, EidosFileReactTrust, EidosFileViewHost, EidosFileViewHostProps, useEidosFile, useEidosFileSession } from "./platform.mjs";
import { EidosStandardView, EidosStandardViewProps, EidosUIRuntimeContextValue, EidosUIRuntimeProvider, EidosUIRuntimeProviderProps, useEidosUIRuntime } from "./runtime-HASH.mjs";
import { useEidosFileRecordInspectorRow } from "./use-eidos-file-record-inspector-row.mjs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogOverlay, AlertDialogPortal, AlertDialogTitle, AlertDialogTrigger } from "./ui/alert-dialog.mjs";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "./ui/dropdown-menu.mjs";
import { DragEndEvent, KanbanBoard, KanbanBoardProps, KanbanCard, KanbanCardProps, KanbanCards, KanbanCardsProps, KanbanHeader, KanbanHeaderProps, KanbanProvider, KanbanProviderProps, Status } from "./ui/kanban.mjs";
import { CreateEidosFileFieldInput, CreateEidosFileTableInput, CreateEidosFileViewInput, EidosFileColumnStatConfig, EidosFileColumnStatResult, EidosFileColumnStatType, EidosFileCsvImportOptions, EidosFileCsvImportPlan, EidosFileCsvImportResult, EidosFileFieldInfo, EidosFileFieldPlacement, EidosFileFilterGroup, EidosFileFormulaPreview, EidosFileFormulaPreviewInput, EidosFileLogicalValue, EidosFileOptionValueChange, EidosFileRelationValue, EidosFileRow, EidosFileRowGroupCount, EidosFileRowMutationResult, EidosFileRowPage, EidosFileRowPageProjection, EidosFileRowQuery, EidosFileRowRange, EidosFileRowValue, EidosFileRowsDeleteResult, EidosFileRowsMutationResult, EidosFileRowsUndoResult, EidosFileSnapshot, EidosFileSort, EidosFileSortDirection, EidosFileSqlPrimitive, EidosFileTableSnapshot, EidosFileViewInfo, FileEntry, RuntimeClient, UpdateEidosFileFieldInput, UpdateEidosFileTableInput, UpdateEidosFileViewInput } from "@eidos.space/eidos-file";
import * as React$2 from "react";
import { ComponentPropsWithoutRef, KeyboardEvent, ReactNode } from "react";
import { BaseDrawArgs, BaseGridCell, CustomCell, CustomRenderer, DataEditorProps, DataEditorRef, EditableGridCell, GridCell, GridColumn, GridSelection, Item, ProvideEditorComponent, Rectangle, SelectionRange, SpriteMap, Theme } from "@glideapps/glide-data-grid";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";
import { Popover, ScrollArea, Select, Switch } from "radix-ui";
import { NumberFormatValues } from "react-number-format/types/types.js";

//#region src/eidos-file-field-property-panel.d.ts
declare function EidosFileFieldPropertyPanel({
  field,
  tables,
  disabled,
  onClose,
  onUpdate,
  onDelete,
  onEditFormula,
  onEditLookup
}: {
  field: EidosFileFieldInfo;
  tables?: readonly EidosFileTableSnapshot[];
  disabled: boolean;
  onClose: () => void;
  onUpdate: (field: EidosFileFieldInfo, changes: UpdateEidosFileFieldInput) => Promise<void> | void;
  onDelete: (field: EidosFileFieldInfo) => void;
  onEditFormula?: (field: EidosFileFieldInfo) => void;
  onEditLookup?: (field: EidosFileFieldInfo) => void;
}): _$react_jsx_runtime0.JSX.Element;
//#endregion
//#region src/ui/primitives.d.ts
declare const Command: React$2.ForwardRefExoticComponent<Omit<{
  children?: React$2.ReactNode;
} & Pick<Pick<React$2.DetailedHTMLProps<React$2.HTMLAttributes<HTMLDivElement>, HTMLDivElement>, keyof React$2.HTMLAttributes<HTMLDivElement> | "key"> & {
  ref?: React$2.Ref<HTMLDivElement>;
} & {
  asChild?: boolean;
}, keyof React$2.HTMLAttributes<HTMLDivElement> | "key" | "asChild"> & {
  label?: string;
  shouldFilter?: boolean;
  filter?: (value: string, search: string, keywords?: string[]) => number;
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  loop?: boolean;
  disablePointerSelection?: boolean;
  vimBindings?: boolean;
} & React$2.RefAttributes<HTMLDivElement>, "ref"> & React$2.RefAttributes<HTMLDivElement>>;
//#endregion
//#region src/eidos-file-command-combobox.d.ts
/**
 * Shared searchable dropdown shell: a Popover hosting a cmdk Command list
 * with keyboard navigation (arrows/Enter), type-to-filter, and scrolling.
 * Consumers own the trigger and the CommandGroup/CommandItem content.
 */
declare function EidosFileCommandCombobox({
  open,
  onOpenChange,
  trigger,
  searchPlaceholder,
  emptyText,
  filter,
  contentClassName,
  listClassName,
  children
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  searchPlaceholder: string;
  emptyText: string;
  filter?: ComponentPropsWithoutRef<typeof Command>["filter"];
  contentClassName?: string;
  listClassName?: string;
  children: ReactNode;
}): _$react_jsx_runtime0.JSX.Element;
//#endregion
//#region src/eidos-file-field-visibility.d.ts
/** Stable Field identity for persisted view/query state. */
declare function eidosFileFieldKey(field: EidosFileFieldInfo): string;
/** Canonical Record Label role. */
declare function isEidosFileRecordLabelField(field: EidosFileFieldInfo): boolean;
declare function eidosFileContentField(table: EidosFileTableSnapshot): EidosFileFieldInfo | null;
declare function isOptionalEidosFileSystemField(field: EidosFileFieldInfo): boolean;
declare function eidosFileFieldDisplayName(field: EidosFileFieldInfo): string;
declare function eidosFileViewVisibleSystemFields(view: EidosFileViewInfo | undefined): string[];
declare function visibleEidosFileFields(fields: EidosFileFieldInfo[], hiddenFields?: readonly string[], visibleSystemFields?: readonly string[]): EidosFileFieldInfo[];
//#endregion
//#region src/eidos-file-attachment-cell.d.ts
interface EidosFileAttachmentCellData {
  readonly kind: "eidos-file-file-cell";
  readonly entries: FileEntry[];
  /** Host-approved, decoded image sources for the current rendered Grid cell. */
  readonly thumbnails?: readonly CanvasImageSource[];
  /** Returns Host-acquired entries; UI never manufactures File metadata. */
  readonly onImport?: () => Promise<FileEntry[]>;
}
type EidosFileAttachmentCell = CustomCell<EidosFileAttachmentCellData>;
declare const EidosFileAttachmentCellEditor: ProvideEditorComponent<EidosFileAttachmentCell>;
declare const EidosFileAttachmentCellRenderer: CustomRenderer<EidosFileAttachmentCell>;
//#endregion
//#region src/eidos-file-entry-surface.d.ts
interface EidosFileEntrySurfaceProps {
  entry: FileEntry;
  className?: string;
  compact?: boolean;
  showActions?: boolean;
}
declare function EidosFileEntryCoverSurface({
  entry,
  fitContent,
  className
}: {
  entry: FileEntry;
  fitContent?: boolean;
  className?: string;
}): _$react_jsx_runtime0.JSX.Element;
/**
 * Renders one File entry without interpreting or dereferencing its canonical
 * URI. Preview and activation consume Host-issued leases exclusively.
 */
declare function EidosFileEntrySurface({
  entry,
  className,
  compact,
  showActions
}: EidosFileEntrySurfaceProps): _$react_jsx_runtime0.JSX.Element;
//#endregion
//#region src/eidos-file-grid.d.ts
interface EidosFileGridProps {
  table: EidosFileTableSnapshot;
  tables?: readonly EidosFileTableSnapshot[];
  view?: EidosFileViewInfo;
  gridTheme?: Partial<Theme>;
  disabled?: boolean;
  /** Hide Glide's always-frozen row marker gutter when space is constrained. */
  showRowMarkers?: boolean;
  reloadToken?: number;
  /** Monotonic Host request used to return keyboard focus to the Grid. */
  focusRequestToken?: number;
  /** Stable identity for the active row query; changing it invalidates positional history. */
  historyScopeKey?: string;
  loadPage: (offset: number, limit: number) => Promise<EidosFileRowPage>;
  locateRow?: (rowId: string) => Promise<number | null>;
  loadColumnStats?: (configs: EidosFileColumnStatConfig[]) => Promise<EidosFileColumnStatResult[]>;
  onAddRow: () => EidosFileGridAppendResult | Promise<EidosFileGridAppendResult>;
  onCellEdit: (row: EidosFileRow, field: EidosFileFieldInfo, value: EidosFileSqlPrimitive) => Promise<EidosFileRowMutationResult>;
  onInspectorCellEdit?: (row: EidosFileRow, field: EidosFileFieldInfo, value: EidosFileSqlPrimitive) => Promise<EidosFileRowMutationResult>;
  onRowsEdit?: (edits: EidosFileGridRowEdit[]) => Promise<EidosFileRowsMutationResult>;
  onSelectedRowsChange?: (ranges: EidosFileRowRange[]) => void;
  onRowCountChange?: (rowCount: number | null) => void;
  searchResultIndex?: number | null;
  onImportFiles?: () => Promise<FileEntry[]>;
  onImportDroppedFiles?: (files: File[], source?: "drop" | "paste") => Promise<FileEntry[]>;
  onOpenRecordInTab?: (row: EidosFileRow) => void;
  onSearchRelation?: (field: EidosFileFieldInfo, query: string) => Promise<EidosFileRelationValue[]>;
  propertyField?: EidosFileFieldInfo | null;
  onPropertyFieldOpen?: (field: EidosFileFieldInfo) => void;
  onPropertyFieldClose?: () => void;
  onFieldUpdate?: (field: EidosFileFieldInfo, changes: UpdateEidosFileFieldInput) => Promise<void> | void;
  onAddField?: (position?: number) => void;
  onEditFormula?: (field: EidosFileFieldInfo, previewRowId?: string, anchor?: EidosFileFormulaEditorAnchor) => void;
  onEditLookup?: (field: EidosFileFieldInfo) => void;
  onDeleteField?: (field: EidosFileFieldInfo) => void;
  onRequestDeleteRows?: (ranges: EidosFileRowRange[]) => Promise<EidosFileGridDeleteResult | void> | void;
  onViewUpdate?: (changes: UpdateEidosFileViewInput) => Promise<void> | void;
  onError?: (error: unknown) => void;
}
interface EidosFileGridUndoCommand {
  /** Change to the current row count after applying this command. */
  rowCountDelta: number;
  /** Apply this inverse and return the next inverse (redo/undo). */
  apply(): Promise<EidosFileGridUndoCommand>;
}
interface EidosFileGridDeleteResult {
  /** Authoritative row count after the deletion. */
  rowCount: number;
  /** Present only when the deletion can be undone in this session. */
  undo?: EidosFileGridUndoCommand;
}
interface EidosFileGridAppendResult extends EidosFileRowMutationResult {
  /**
   * When present, `row` is an optimistic placeholder that can render and be
   * edited immediately. The settled mutation supplies the authoritative Row
   * ID and revision without blocking Glide's appended-row editor.
   */
  settled?: Promise<EidosFileRowMutationResult>;
}
interface EidosFileGridRowEdit {
  row: EidosFileRow;
  changes: EidosFileRow;
}
declare const EidosFileGrid: React$2.NamedExoticComponent<EidosFileGridProps>;
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
declare function eidosFileValueToGridCell(field: EidosFileFieldInfo, value: EidosFileRowValue | undefined, readonly?: boolean, row?: EidosFileRow, unavailableRelationTitle?: string, allowWrapping?: boolean, timeZone?: string): GridCell;
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
  onHide,
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
  onHide: (field: EidosFileFieldInfo) => void;
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
  canDelete,
  onOpenChange,
  onOpenRecord,
  onCopyCell,
  onCopyRecordId,
  onOpenUrl,
  onDeleteRows
}: {
  state: EidosFileCellMenuState | null;
  open: boolean;
  selectionCount: number;
  cellText: string;
  canDelete: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenRecord: (state: EidosFileCellMenuState) => void;
  onCopyCell: (text: string) => void;
  onCopyRecordId: (id: string) => void;
  onOpenUrl?: (url: string) => void;
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
//#region src/eidos-file-search-navigation.d.ts
type EidosFileSearchNavigationDirection = "next" | "previous";
interface EidosFileSearchNavigationState {
  searchResultCount: number | null;
  searchResultIndex: number | null;
  navigateSearchResults(direction: EidosFileSearchNavigationDirection): void;
  reportSearchResultCount(rowCount: number | null): void;
}
/**
 * Owns result counting and cyclic navigation for one Eidos File editor surface.
 * The query toolbar and active view discover this scope automatically.
 */
declare function EidosFileSearchNavigationProvider({
  search,
  scopeKey,
  children
}: {
  search: string;
  scopeKey: string;
  children: ReactNode;
}): _$react_jsx_runtime0.JSX.Element;
/** Returns the nearest editor search scope, if one is installed. */
declare function useEidosFileSearchNavigation(): EidosFileSearchNavigationState | null;
//#endregion
//#region src/eidos-file-record-field-editor.d.ts
declare function EidosFileRecordFieldEditor({
  field,
  row,
  placeholder,
  disabled,
  onChange
}: {
  field: EidosFileFieldInfo;
  row: EidosFileRow;
  placeholder?: string;
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
  onError
}: {
  value: EidosFileRow[string];
  disabled: boolean;
  onChange: (value: string | null) => Promise<void>;
  onImportFiles?: () => Promise<FileEntry[]>;
  onImportDroppedFiles?: (files: File[], source?: "drop" | "paste") => Promise<FileEntry[]>;
  onError?: (error: unknown) => void;
}): _$react_jsx_runtime0.JSX.Element;
//#endregion
//#region src/eidos-file-record-format.d.ts
declare function eidosFileRecordFieldText(row: EidosFileRow, field: EidosFileFieldInfo, timeZone?: string): string;
declare function eidosFileRecordTitle(row: EidosFileRow, fields?: EidosFileFieldInfo[]): string;
//#endregion
//#region src/eidos-file-record-inspector.d.ts
interface EidosFileRecordInspectorProps {
  row: EidosFileRow;
  fields: EidosFileFieldInfo[];
  variant?: "panel" | "page";
  contentField?: EidosFileFieldInfo | null;
  onClose?: () => void;
  onOpenInTab?: (row: EidosFileRow) => void;
  onCopyRecordId: (id: string) => void;
  onCellEdit?: (row: EidosFileRow, field: EidosFileFieldInfo, value: EidosFileSqlPrimitive) => Promise<EidosFileRowMutationResult>;
  disabled?: boolean;
  loading?: boolean;
  loadError?: string | null;
  onRetryLoad?: () => void;
  onError?: (error: unknown) => void;
  onImportFiles?: () => Promise<FileEntry[]>;
  onImportDroppedFiles?: (files: File[], source?: "drop" | "paste") => Promise<FileEntry[]>;
  onSearchRelation?: (field: EidosFileFieldInfo, query: string) => Promise<EidosFileRelationValue[]>;
}
declare function EidosFileRecordInspector({
  row,
  fields,
  variant,
  contentField,
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
  onSearchRelation
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
//#region src/eidos-file-related-record-panel.d.ts
interface EidosFileRelatedRecordPanelProps {
  source: EidosFileEditorDataSource;
  table: EidosFileTableSnapshot;
  target: EidosFileRelationRecordTarget;
  disabled?: boolean;
  onClose: () => void;
  onMutation?: (result: EidosFileRowMutationResult) => void;
  onError?: (error: unknown) => void;
  onImportFiles?: () => Promise<FileEntry[]>;
  onImportDroppedFiles?: (files: File[], source?: "drop" | "paste") => Promise<FileEntry[]>;
}
/** Host-neutral detail panel for a record reached through a relation field. */
declare function EidosFileRelatedRecordPanel({
  source,
  table,
  target,
  disabled,
  onClose,
  onMutation,
  onError,
  onImportFiles,
  onImportDroppedFiles
}: EidosFileRelatedRecordPanelProps): _$react_jsx_runtime0.JSX.Element | null;
//#endregion
//#region src/eidos-file-relation-cell.d.ts
interface EidosFileRelationCellData {
  readonly kind: "eidos-file-relation-cell";
  readonly values: EidosFileRelationValue[];
  readonly multiple: boolean;
  readonly targetTableId?: string;
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
  setActiveOptionId: React$2.Dispatch<React$2.SetStateAction<string | null>>;
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
  targetTableId,
  onActiveOptionChange,
  onOpenRecord,
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
  targetTableId?: string;
  onActiveOptionChange: (optionId: string) => void;
  onOpenRecord?: () => void;
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
//#region src/runtime-editor-data-source.d.ts
/**
 * Presents the established rich editor contract over the normative Runtime
 * 1.0 boundary. It owns presentation-shape conversion only: every read and
 * mutation still crosses RuntimeClient and never receives SQL or file bytes.
 */
declare class EidosRuntimeEditorDataSource implements EidosFileEditorDataSource {
  readonly runtime: RuntimeClient;
  readonly path: string;
  private sequence;
  private runtimeCapabilities;
  private runtimeSnapshot;
  private schema;
  private tables;
  private fields;
  private fieldsByTable;
  private views;
  private cursorCache;
  constructor(runtime: RuntimeClient, path: string);
  initialize(): Promise<EidosFileSnapshot>;
  getSnapshot(): Promise<EidosFileSnapshot>;
  getPage(tableId: string, offset: number, limit: number, query: EidosFileRowQuery, totalHint?: number, cursor?: string, projection?: EidosFileRowPageProjection): Promise<EidosFileRowPage>;
  getRowIndex(tableId: string, rowId: string, query: EidosFileRowQuery): Promise<number | null>;
  getRow(tableId: string, rowId: string): Promise<EidosFileRow | null>;
  getGroupCounts(tableId: string, fieldId: string, query: EidosFileRowQuery): Promise<EidosFileRowGroupCount[]>;
  calculateColumnStats(tableId: string, configs: EidosFileColumnStatConfig[], query: EidosFileRowQuery): Promise<EidosFileColumnStatResult[]>;
  previewFormula(tableId: string, input: EidosFileFormulaPreviewInput): Promise<EidosFileFormulaPreview>;
  insertRow(tableId: string, fields: Record<string, EidosFileLogicalValue>): Promise<EidosFileRowMutationResult>;
  updateRow(tableId: string, rowId: string, fields: Record<string, EidosFileLogicalValue>): Promise<EidosFileRowMutationResult>;
  deleteRows(tableId: string, rowIds: string[]): Promise<EidosFileRowsDeleteResult>;
  revertRowMutation(tableId: string, undoToken: string): Promise<EidosFileRowsUndoResult>;
  deleteRowRanges(tableId: string, ranges: EidosFileRowRange[], query: EidosFileRowQuery): Promise<EidosFileRowsDeleteResult>;
  addField(tableId: string, field: CreateEidosFileFieldInput, placement?: EidosFileFieldPlacement): Promise<EidosFileSnapshot>;
  private conversionOptionNames;
  private inferredFieldOptions;
  private conversionFieldSettings;
  private assertRatingValues;
  updateField(tableId: string, fieldId: string, changes: UpdateEidosFileFieldInput): Promise<EidosFileSnapshot>;
  deleteField(tableId: string, fieldId: string): Promise<EidosFileSnapshot>;
  createTable(input: CreateEidosFileTableInput): Promise<EidosFileSnapshot>;
  updateTable(tableId: string, changes: UpdateEidosFileTableInput): Promise<EidosFileSnapshot>;
  deleteTable(tableId: string): Promise<EidosFileSnapshot>;
  reorderTables(tableIds: string[]): Promise<EidosFileSnapshot>;
  createView(tableId: string, input: CreateEidosFileViewInput): Promise<EidosFileSnapshot>;
  duplicateView(viewId: string, name?: string): Promise<EidosFileSnapshot>;
  deleteView(viewId: string): Promise<EidosFileSnapshot>;
  reorderViews(tableId: string, viewIds: string[]): Promise<EidosFileSnapshot>;
  updateView(viewId: string, changes: UpdateEidosFileViewInput): Promise<EidosFileSnapshot>;
  previewCsv(fileName: string, bytes: ArrayBuffer, options?: EidosFileCsvImportOptions): Promise<EidosFileCsvImportPlan>;
  importCsv(fileName: string, bytes: ArrayBuffer, options?: EidosFileCsvImportOptions): Promise<{
    snapshot: EidosFileSnapshot;
    result: EidosFileCsvImportResult;
  }>;
  private commitSchema;
  private editorSnapshot;
  hydrateRowCounts(snapshot: EidosFileSnapshot): Promise<EidosFileSnapshot>;
  private editorTable;
  private editorField;
  private editorView;
  private editorFieldProperty;
  private editorFieldType;
  private editorRow;
  private editorValue;
  private editorSqlValue;
  private runtimeValues;
  private runtimeValue;
  private projection;
  private projectionFields;
  private runtimeQuery;
  private runtimeFilter;
  private runtimeFilterRule;
  private editorFilter;
  private editorFilterNode;
  private savedViewQuery;
  private viewLayout;
  private editorOrderMap;
  private layoutFieldOrder;
  private completeVisibleFieldOrder;
  private editorHiddenFields;
  private newField;
  private formulaDefinition;
  private lookupDefinition;
  private relationDefinition;
  private displayType;
  private countRows;
  private requiresStructuredColumnStat;
  private calculateStructuredColumnStats;
  private rowMutationResult;
  private statValue;
  private indexSchema;
  private acceptRevision;
  private revision;
  private editorRevision;
  private assertTable;
  private assertField;
  private assertView;
  private nextPosition;
  private positionSort;
  private context;
  private id;
}
//#endregion
//#region src/grid-default-config.d.ts
declare const defaultConfig: Partial<DataEditorProps>;
declare function getScrollbarWidth(): number;
//#endregion
//#region src/header-icons.d.ts
declare const EIDOS_FILE_EMPTY_STAT_ICON = "eidos-file-empty-stat";
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
interface UndoRedoCommand {
  apply(): Promise<UndoRedoCommand>;
  onError?(error: unknown): void;
}
declare function useUndoRedo(gridRef: React.RefObject<DataEditorRef>, getCellContent: (cell: Item) => GridCell, onCellEdited: (cell: Item, newValue: EditableGridCell) => void, onGridSelectionChange?: (newVal: GridSelection) => void, isActive?: () => boolean, onCellsEdited?: (edits: readonly UndoRedoEdit[]) => void, maxHistoryBatches?: number): {
  undo: () => void;
  redo: () => void;
  reset: () => void;
  recordCommand: (command: UndoRedoCommand) => void;
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
/**
 * Matches a `keydown` event against an aria-keyshortcuts style binding like
 * "Control+PageUp". The modifier set must match exactly so composed bindings
 * (e.g. Control+Shift+PageUp) never shadow their simpler variants.
 */
declare function eidosFileKeyboardEventMatchesBinding(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}, binding: string): boolean;
/**
 * Global previous/next tab cycling for a tab strip, so keyboard users can
 * switch tabs without first focusing the strip (the declared
 * aria-keyshortcuts contract). Typing contexts (inputs, text areas, rich
 * text) keep the keys for their own editing behavior.
 */
declare function useEidosFileTabCycleShortcut<T extends EidosFileTabStripItem>({
  items,
  activeId,
  disabled,
  onSelect,
  previousBindings,
  nextBindings
}: {
  items: readonly T[];
  activeId?: string | null;
  disabled?: boolean;
  onSelect: (id: string) => void;
  previousBindings: readonly string[];
  nextBindings: readonly string[];
}): void;
declare function useEidosFileTabStrip<T extends EidosFileTabStripItem>({
  items,
  activeId,
  onSelect
}: {
  items: T[];
  activeId?: string | null;
  onSelect: (id: string) => void;
}): {
  activeTabRef: React$2.RefObject<HTMLButtonElement>;
  canScrollBackward: boolean;
  canScrollForward: boolean;
  navigateTabs: (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => void;
  scrollTabs: (direction: -1 | 1) => void;
  tabStopId: string | null | undefined;
  updateScrollState: () => void;
  viewportRef: React$2.RefObject<HTMLDivElement>;
};
//#endregion
//#region src/cells/date-picker-cell.d.ts
interface DatePickerCellProps {
  readonly kind: "date-picker-cell";
  readonly date: Date | undefined;
  readonly displayDate: string;
  readonly format: "date" | "datetime-local";
  readonly timeZone?: string;
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
  readonly onCreateOption?: (options: readonly EidosFileGridSelectOption[]) => Promise<void>;
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
declare const NumberOverlayEditor: React$2.FunctionComponent<Props>;
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
  readonly onCreateOption?: (options: readonly EidosFileGridSelectOption[]) => Promise<void>;
  readonly readonly?: boolean;
}
type SelectCell = CustomCell<SelectCellProps>;
declare const renderer$4: CustomRenderer<SelectCell>;
//#endregion
export { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogOverlay, AlertDialogPortal, AlertDialogTitle, AlertDialogTrigger, AssetPresenter, DEFAULT_BASE_NUMBER_PROPERTY, renderer as DatePickerCell, type DatePickerCell as DatePickerCellType, DragEndEvent, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, EIDOS_FILE_EMPTY_STAT_ICON, EIDOS_FILE_EXTENSION_VIEW_PREFIX, EIDOS_FILE_FIELD_TYPE_GROUPS, EIDOS_FILE_OPTION_COLORS, EIDOS_FILE_VIRTUAL_SCROLL_MAX_ITEMS, EIDOS_FILE_VIRTUAL_SCROLL_MAX_SIZE, EIDOS_UI_PROTOCOL, EidosFileActionPluginContribution, EidosFileAttachmentCell, EidosFileAttachmentCellData, EidosFileAttachmentCellEditor, EidosFileAttachmentCellRenderer, EidosFileBoundedVirtualizerResult, EidosFileBuiltInViewType, EidosFileCalendarCreateMode, EidosFileCalendarFieldType, EidosFileCalendarLayout, EidosFileCalendarPage, EidosFileCalendarPageRequest, EidosFileCalendarRange, EidosFileCalendarView, EidosFileCellMenu, EidosFileCellMenuState, EidosFileColumnStatMenu, EidosFileCommandCombobox, EidosFileCommandContext, EidosFileCreatableFieldType, EidosFileCsvImportPopover, EidosFileCsvImportPopoverProps, EidosFileCsvOperationProgress, EidosFileCsvOperationProgressBar, EidosFileCsvOperationProgressBarProps, EidosFileDataGrid, EidosFileDataGridProps, EidosFileDataSource, EidosFileEditorContent, EidosFileEditorDataSource, EidosFileEditorRoot, EidosFileEditorShell, EidosFileEditorShellProps, EidosFileEditorView, EidosFileEditorViewProps, EidosFileEditorWorkbar, EidosFileEmptyState, EidosFileEmptyStateProps, EidosFileEmptyStateTemplate, EidosFileEntryCoverSurface, EidosFileEntrySurface, EidosFileEntrySurfaceProps, EidosFileExternalViewContribution, EidosFileFieldCreatePopover, EidosFileFieldCreatePopoverProps, EidosFileFieldMenu, EidosFileFieldMenuState, EidosFileFieldPropertyPanel, EidosFileFieldTypeIcon, EidosFileFieldTypePicker, EidosFileFormEditorMode, EidosFileFormModeToolbar, EidosFileFormView, EidosFileFormulaComposer, EidosFileFormulaComposerProps, EidosFileFormulaEditorAnchor, EidosFileFormulaEditorPopover, EidosFileFormulaInputRef, EidosFileGalleryView, EidosFileGrid, EidosFileGridAppendResult, EidosFileGridDeleteResult, EidosFileGridProps, EidosFileGridRenderer, EidosFileGridRowEdit, EidosFileGridUndoCommand, EidosFileImagePresentationLease, EidosFileKanbanView, EidosFileLookupEditorPopover, EidosFileNumberPropertiesEditor, EidosFileNumberProperty, EidosFileOptionsEditor, EidosFilePlugin, EidosFilePluginContext, EidosFilePluginRegistry, EidosFilePluginSlot, EidosFileProvider, EidosFileProviderProps, EidosFileQueryToolbar, EidosFileReactContextValue, EidosFileReactTrust, EidosFileRecordAttachmentEditor, EidosFileRecordCard, EidosFileRecordCardFieldLayout, EidosFileRecordCardLayout, EidosFileRecordDeleteDialog, EidosFileRecordFieldEditor, EidosFileRecordInspector, EidosFileRecordInspectorProps, EidosFileRecordRelationEditor, EidosFileRelatedRecordPanel, EidosFileRelatedRecordPanelProps, EidosFileRelationCell, EidosFileRelationCellEditor, EidosFileRelationCellRenderer, EidosFileRelationOptionList, EidosFileRelationRecordTarget, EidosFileRowWindow, EidosFileRowWindowMergeMode, EidosFileRowWindowRequest, EidosFileSearchNavigationDirection, EidosFileSearchNavigationProvider, EidosFileSearchNavigationState, EidosFileSelectOption, EidosFileSelectOptionsEditor, EidosFileSheetCreatePopover, EidosFileSheetTabActions, EidosFileSheetTabRenderer, EidosFileSheetTabStrip, EidosFileSheetTabs, EidosFileSheetTabsProps, EidosFileTabStripItem, EidosFileUIAssetSession, EidosFileUIHost, EidosFileUIKeyboardShortcuts, EidosFileUILocale, EidosFileUIMessageOverrides, EidosFileUIMessageValues, EidosFileUIProvider, EidosFileUIThemeName, EidosFileUnsupportedQuery, EidosFileUnsupportedView, EidosFileViewCapabilities, EidosFileViewCommand, EidosFileViewCreateOptions, EidosFileViewCsvExport, EidosFileViewFieldsPopover, EidosFileViewHost, EidosFileViewHostProps, EidosFileViewPluginContribution, EidosFileViewRenderer, EidosFileViewRendererProps, EidosFileViewRendererRegistry, EidosFileViewSelection, EidosFileViewSelector, EidosFileViewSelectorRequest, EidosFileViewState, EidosFileViewTabActions, EidosFileViewTabRenderer, EidosFileViewTabStrip, EidosFileViewTabs, EidosFileViewTabsProps, EidosFileViewTypeIcon, EidosFileVirtualWindow, EidosRuntimeEditorDataSource, EidosStandardView, EidosStandardViewProps, EidosUIKernel, EidosUIKernelOptions, EidosUIKernelPhase, EidosUIKernelState, EidosUIRuntimeContextValue, EidosUIRuntimeProvider, EidosUIRuntimeProviderProps, EidosUISchemaIndex, ExportEidosFileViewCsvOptions, KanbanBoard, KanbanBoardProps, KanbanCard, KanbanCardProps, KanbanCards, KanbanCardsProps, KanbanHeader, KanbanHeaderProps, KanbanProvider, KanbanProviderProps, renderer$1 as MultiSelectCell, type MultiSelectCell as MultiSelectCellType, NumberOverlayEditor, OpenEidosUISourceRequest, renderer$2 as RangeCell, type RangeCell as RangeCellType, renderer$3 as RatingCell, type RatingCell as RatingCellType, renderer$4 as SelectCell, type SelectCell as SelectCellType, Status, UndoRedoCommand, UndoRedoEdit, builtInEidosFileViewRenderers, contextRowRanges, createEidosFilePluginRegistry, createEidosFileRecordCardLayout, defaultConfig, defineEidosFilePlugin, defineEidosFileView, drawDrilldownCell, drawImage, eidosFileCalendarCreateMode, eidosFileCalendarCreateValue, eidosFileCalendarDateFields, eidosFileCalendarFieldType, eidosFileCalendarLayout, eidosFileCalendarRowDateKey, eidosFileContentField, eidosFileErrorMessage, eidosFileExtensionContributionId, eidosFileExtensionViewType, eidosFileFieldDisplayName, eidosFileFieldDisplaysUrl, eidosFileFieldKey, eidosFileFieldTypeIcon, eidosFileGridColumn, eidosFileGridScrollbarConfig, eidosFileGridSelectOptions, eidosFileKeyboardEventMatchesBinding, eidosFileNumberProperty, eidosFileOptionColor, eidosFileRecordCardPageProjection, eidosFileRecordFieldText, eidosFileRecordTitle, eidosFileSelectDefaultOption, eidosFileSelectOptions, eidosFileUrlDisplaysImage, eidosFileValueToGridCell, eidosFileViewFreezeColumns, eidosFileViewGroupFilter, eidosFileViewRowQuery, eidosFileViewVisibleSystemFields, eidosFileVirtualItemOffset, eidosFileVirtualLogicalOffset, eidosFileVirtualPhysicalOffset, eidosFileVirtualPhysicalSize, eidosFileVirtualWindowForOffset, eidosUIPresentValue, eidosUIViewQuery, eidosUIVisibleFields, exportEidosFileViewCsv, getMiddleCenterBias, getScrollbarWidth, gridCellToEidosFileValue, headerIcons, isEidosFileBuiltInViewType, isEidosFileRecordCoverField, isEidosFileRecordLabelField, isOptionalEidosFileSystemField, makeHeaderIcons, measureTextCached, mergeRowWindowPage, nextEidosFileFieldSorts, nextEidosFileOptionColor, orderedEidosFileFields, removeItemFromArray, requestForPrefetchedRowWindow, requestForRowWindow, resetEidosFileVirtualizerMeasurements, roundedRect, rowFromWindow, rowRangeCount, rowSelectionRanges, selectEidosFileRecordCardFields, translateEidosFileUI, useEidosFile, useEidosFileBoundedVirtualizer, useEidosFileGridTheme, useEidosFileRecordInspectorRow, useEidosFileRelationListbox, useEidosFileSearchNavigation, useEidosFileSession, useEidosFileTabCycleShortcut, useEidosFileTabStrip, useEidosFileUI, useEidosUIRuntime, useUndoRedo, visibleEidosFileFields };
```

## ./context

```ts
import { a as EidosFileUIHost, c as EidosFileUIThemeName, i as EidosFileUIAssetSession, l as useEidosFileUI, n as EidosFileImagePresentationLease, o as EidosFileUIKeyboardShortcuts, r as EidosFileRelationRecordTarget, s as EidosFileUIProvider, t as AssetPresenter } from "./context-HASH.mjs";
export { AssetPresenter, EidosFileImagePresentationLease, EidosFileRelationRecordTarget, EidosFileUIAssetSession, EidosFileUIHost, EidosFileUIKeyboardShortcuts, EidosFileUIProvider, EidosFileUIThemeName, useEidosFileUI };
```

## ./eidos-file-calendar-view

```ts
import { EidosFileFieldInfo, EidosFileRelationValue, EidosFileRow, EidosFileRowMutationResult, EidosFileSqlPrimitive, EidosFileTableSnapshot, EidosFileViewInfo, FileEntry } from "@eidos.space/eidos-file";
import { ReactNode } from "react";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/eidos-file-calendar-view.d.ts
interface EidosFileCalendarRange {
  start: Date;
  end: Date;
}
interface EidosFileCalendarPage {
  rows: EidosFileRow[];
  total: number;
  nextCursor: string | null;
}
interface EidosFileCalendarPageRequest {
  limit: number;
  cursor?: string;
  totalHint?: number;
}
type EidosFileCalendarFieldType = "date" | "datetime";
type EidosFileCalendarCreateMode = "all-days" | "today" | "none";
type EidosFileCalendarLayout = "month" | "week";
declare function eidosFileCalendarLayout(value: unknown): EidosFileCalendarLayout;
declare function eidosFileCalendarFieldType(field: EidosFileFieldInfo): EidosFileCalendarFieldType | null;
declare function eidosFileCalendarDateFields(fields: readonly EidosFileFieldInfo[]): EidosFileFieldInfo[];
declare function eidosFileCalendarCreateMode(field: EidosFileFieldInfo): EidosFileCalendarCreateMode;
declare function eidosFileCalendarCreateValue(field: EidosFileFieldInfo, day: Date, timeZone?: string): string | undefined;
declare function eidosFileCalendarRowDateKey(row: EidosFileRow, field: EidosFileFieldInfo, timeZone?: string): string | null;
declare function EidosFileCalendarView({
  table,
  view,
  disabled,
  reloadToken,
  loadRows,
  loadDayTotals,
  loadRow,
  onCellEdit,
  onAddRow,
  onDeleteRow,
  onImportFiles,
  onImportDroppedFiles,
  onSearchRelation,
  onLayoutChange,
  onRowCountChange,
  onError,
  sidePanel
}: {
  table: EidosFileTableSnapshot;
  view: EidosFileViewInfo;
  disabled?: boolean;
  reloadToken?: number;
  loadRows: (field: EidosFileFieldInfo, range: EidosFileCalendarRange, request: EidosFileCalendarPageRequest) => Promise<EidosFileCalendarPage>;
  loadDayTotals?: (field: EidosFileFieldInfo, range: EidosFileCalendarRange) => Promise<Map<string, number> | null>;
  loadRow?: (rowId: string) => Promise<EidosFileRow | null>;
  onCellEdit?: (row: EidosFileRow, field: EidosFileFieldInfo, value: EidosFileSqlPrimitive) => Promise<EidosFileRowMutationResult>;
  onAddRow?: (field: EidosFileFieldInfo, day: Date) => Promise<EidosFileRowMutationResult>;
  onDeleteRow?: (row: EidosFileRow) => Promise<void>;
  onImportFiles?: () => Promise<FileEntry[]>;
  onImportDroppedFiles?: (files: File[], source?: "drop" | "paste") => Promise<FileEntry[]>;
  onSearchRelation?: (field: EidosFileFieldInfo, query: string) => Promise<EidosFileRelationValue[]>;
  onLayoutChange?: (layout: EidosFileCalendarLayout) => void | Promise<void>;
  onRowCountChange?: (rowCount: number | null) => void;
  onError?: (error: unknown) => void;
  sidePanel?: ReactNode;
}): _$react_jsx_runtime0.JSX.Element;
//#endregion
export { EidosFileCalendarCreateMode, EidosFileCalendarFieldType, EidosFileCalendarLayout, EidosFileCalendarPage, EidosFileCalendarPageRequest, EidosFileCalendarRange, EidosFileCalendarView, eidosFileCalendarCreateMode, eidosFileCalendarCreateValue, eidosFileCalendarDateFields, eidosFileCalendarFieldType, eidosFileCalendarLayout, eidosFileCalendarRowDateKey };
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
import { t as EidosFileFormulaEditorAnchor } from "./eidos-file-derived-field-editor-HASH.mjs";
import { EidosFileFieldInfo, EidosFileRowMutationResult, EidosFileRowQuery, EidosFileRowRange, EidosFileRowsDeleteResult, EidosFileSnapshot, EidosFileTableSnapshot, EidosFileViewInfo, FileEntry } from "@eidos.space/eidos-file";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/eidos-file-data-grid.d.ts
interface EidosFileDataGridProps {
  source: EidosFileEditorDataSource;
  table: EidosFileTableSnapshot;
  tables?: readonly EidosFileTableSnapshot[];
  view?: EidosFileViewInfo;
  search?: string;
  searchResultIndex?: number | null;
  showRowMarkers?: boolean;
  disabled?: boolean;
  reloadToken?: number;
  focusRequestToken?: number;
  propertyField?: EidosFileFieldInfo | null;
  onMutation?: (result: EidosFileRowMutationResult) => void;
  onDeleteRows?: (ranges: EidosFileRowRange[], query: EidosFileRowQuery) => Promise<EidosFileRowsDeleteResult | void>;
  onSnapshot?: (snapshot: EidosFileSnapshot) => void;
  onFieldOpen?: (field: EidosFileFieldInfo) => void;
  onFieldClose?: () => void;
  onFieldAdd?: (position?: number) => void;
  onEditFormula?: (field: EidosFileFieldInfo, previewRowId?: string, anchor?: EidosFileFormulaEditorAnchor) => void;
  onEditLookup?: (field: EidosFileFieldInfo) => void;
  onSearchResultCountChange?: (rowCount: number | null) => void;
  onError?: (error: unknown) => void;
  onImportFiles?: () => Promise<FileEntry[]>;
  onImportDroppedFiles?: (files: File[], source?: "drop" | "paste") => Promise<FileEntry[]>;
}
/**
 * Convenience adapter for hosts that expose the public EidosFileEditorDataSource.
 * It keeps paging and mutations outside React while rendering the exact shared
 * Desktop Grid component.
 */
declare function EidosFileDataGrid({
  source,
  table,
  tables,
  view,
  search,
  searchResultIndex,
  showRowMarkers,
  disabled,
  reloadToken,
  focusRequestToken,
  propertyField,
  onMutation,
  onDeleteRows,
  onSnapshot,
  onFieldOpen,
  onFieldClose,
  onFieldAdd,
  onEditFormula,
  onEditLookup,
  onSearchResultCountChange,
  onError,
  onImportFiles,
  onImportDroppedFiles
}: EidosFileDataGridProps): _$react_jsx_runtime0.JSX.Element;
//#endregion
export { EidosFileDataGrid, EidosFileDataGridProps };
```

## ./eidos-file-derived-field-editor

```ts
import { n as EidosFileFormulaEditorPopover, r as EidosFileLookupEditorPopover, t as EidosFileFormulaEditorAnchor } from "./eidos-file-derived-field-editor-HASH.mjs";
export { EidosFileFormulaEditorAnchor, EidosFileFormulaEditorPopover, EidosFileLookupEditorPopover };
```

## ./eidos-file-editor-chrome

```ts
import { a as EidosFileViewTabStrip, c as ExportEidosFileViewCsvOptions, i as EidosFileSheetTabStrip, l as exportEidosFileViewCsv, n as EidosFileEditorRoot, o as EidosFileViewTypeIcon, r as EidosFileEditorWorkbar, s as EidosFileViewCsvExport, t as EidosFileEditorContent } from "./eidos-file-editor-chrome-HASH.mjs";
export { EidosFileEditorContent, EidosFileEditorRoot, EidosFileEditorWorkbar, EidosFileSheetTabStrip, EidosFileViewCsvExport, EidosFileViewTabStrip, EidosFileViewTypeIcon, ExportEidosFileViewCsvOptions, exportEidosFileViewCsv };
```

## ./eidos-file-editor-shell

```ts
import * as _$react from "react";
import { HTMLAttributes, ReactNode } from "react";

//#region src/eidos-file-editor-shell.d.ts
interface EidosFileEditorShellProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  viewTabs?: ReactNode;
  queryToolbar?: ReactNode;
  fields?: ReactNode;
  fieldCreator?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
  contentProps?: HTMLAttributes<HTMLDivElement>;
  sheetTabs?: ReactNode;
  overlays?: ReactNode;
  searchNavigation?: {
    search: string;
    scopeKey: string;
  };
}
/**
 * Canonical Eidos File editor composition shared by every host.
 *
 * Hosts own file/session lifecycle and provide the rendered view, while this
 * component owns the stable UI hierarchy and interaction placement.
 */
declare const EidosFileEditorShell: _$react.ForwardRefExoticComponent<EidosFileEditorShellProps & _$react.RefAttributes<HTMLDivElement>>;
//#endregion
export { EidosFileEditorShell, EidosFileEditorShellProps };
```

## ./eidos-file-editor-view

```ts
import { C as builtInEidosFileViewRenderers, S as EidosFileViewState, _ as EidosFileViewCommand, b as EidosFileViewRendererRegistry, d as EidosFileEditorView, f as EidosFileEditorViewProps, g as EidosFileViewCapabilities, h as EidosFileUnsupportedView, m as EidosFileUnsupportedQuery, p as EidosFileGridRenderer, u as EidosFileCommandContext, v as EidosFileViewRenderer, x as EidosFileViewSelection, y as EidosFileViewRendererProps } from "./plugin-HASH.mjs";
export { EidosFileCommandContext, EidosFileEditorView, EidosFileEditorViewProps, EidosFileGridRenderer, EidosFileUnsupportedQuery, EidosFileUnsupportedView, EidosFileViewCapabilities, EidosFileViewCommand, EidosFileViewRenderer, EidosFileViewRendererProps, EidosFileViewRendererRegistry, EidosFileViewSelection, EidosFileViewState, builtInEidosFileViewRenderers };
```

## ./eidos-file-empty-state

```ts
import { ReactNode } from "react";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/eidos-file-empty-state.d.ts
type EidosFileEmptyStateTemplate = "blank" | "tasks";
interface EidosFileEmptyStateProps {
  disabled?: boolean;
  creatingTemplate?: EidosFileEmptyStateTemplate | null;
  templateError?: {
    template: EidosFileEmptyStateTemplate;
    message: string;
  } | null;
  importAction: ReactNode;
  onCreateTemplate: (template: EidosFileEmptyStateTemplate) => void;
}
declare function EidosFileEmptyState({
  disabled,
  creatingTemplate,
  templateError,
  importAction,
  onCreateTemplate
}: EidosFileEmptyStateProps): _$react_jsx_runtime0.JSX.Element;
//#endregion
export { EidosFileEmptyState, EidosFileEmptyStateProps, EidosFileEmptyStateTemplate };
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
import { EidosFileCreatableFieldType } from "./eidos-file-field-type-picker.mjs";
import { CreateEidosFileFieldInput, EidosFileFormulaPreview, EidosFileFormulaPreviewInput, EidosFileTableSnapshot } from "@eidos.space/eidos-file";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/eidos-file-field-create-popover.d.ts
interface EidosFileFieldCreatePopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: EidosFileTableSnapshot;
  tables: EidosFileTableSnapshot[];
  disabled?: boolean;
  allowedTypes?: readonly EidosFileCreatableFieldType[];
  onCreate: (field: CreateEidosFileFieldInput) => Promise<void> | void;
  onPreviewFormula?: (input: EidosFileFormulaPreviewInput) => Promise<EidosFileFormulaPreview>;
}
declare function EidosFileFieldCreatePopover({
  open,
  onOpenChange,
  table,
  tables,
  disabled,
  allowedTypes,
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
/** Icon for a creatable or system Field type, undefined for unknown types. */
declare function eidosFileFieldTypeIcon(type: string): ComponentType<{
  className?: string;
}> | undefined;
/** Shared visual identity for every field-type choice and selected value. */
declare function EidosFileFieldTypeIcon({
  type,
  className
}: {
  type: EidosFileCreatableFieldType;
  className?: string;
}): _$react_jsx_runtime0.JSX.Element;
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
  allowedTypes,
  disabled
}: {
  value: EidosFileCreatableFieldType;
  onChange: (value: EidosFileCreatableFieldType) => void;
  allowedTypes?: readonly EidosFileCreatableFieldType[];
  disabled?: boolean;
}): _$react_jsx_runtime0.JSX.Element | null;
//#endregion
export { EIDOS_FILE_FIELD_TYPE_GROUPS, EidosFileCreatableFieldType, EidosFileFieldTypeIcon, EidosFileFieldTypePicker, eidosFileFieldTypeIcon };
```

## ./eidos-file-form-view

```ts
import { y as EidosFileViewRendererProps } from "./plugin-HASH.mjs";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/eidos-file-form-view.d.ts
type EidosFileFormEditorMode = "build" | "preview";
declare function EidosFileFormModeToolbar({
  mode,
  disabled,
  onModeChange
}: {
  mode: EidosFileFormEditorMode;
  disabled?: boolean;
  onModeChange: (mode: EidosFileFormEditorMode) => void;
}): _$react_jsx_runtime0.JSX.Element;
declare function EidosFileFormView(props: EidosFileViewRendererProps): _$react_jsx_runtime0.JSX.Element | null;
//#endregion
export { EidosFileFormEditorMode, EidosFileFormModeToolbar, EidosFileFormView };
```

## ./eidos-file-formula-composer

```ts
import { n as EidosFileFormulaComposerProps, r as EidosFileFormulaInputRef, t as EidosFileFormulaComposer } from "./eidos-file-formula-composer-HASH.mjs";
export { EidosFileFormulaComposer, EidosFileFormulaComposerProps, EidosFileFormulaInputRef };
```

## ./eidos-file-gallery-view

```ts
import { EidosFileFieldInfo, EidosFileRelationValue, EidosFileRow, EidosFileRowMutationResult, EidosFileRowPage, EidosFileSqlPrimitive, EidosFileTableSnapshot, EidosFileViewInfo, FileEntry } from "@eidos.space/eidos-file";
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
  onImportFiles?: () => Promise<FileEntry[]>;
  onImportDroppedFiles?: (files: File[], source?: "drop" | "paste") => Promise<FileEntry[]>;
  onSearchRelation?: (field: EidosFileFieldInfo, query: string) => Promise<EidosFileRelationValue[]>;
  onDeleteRow?: (row: EidosFileRow) => Promise<void>;
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
import { EidosFileFieldInfo, EidosFileRelationValue, EidosFileRow, EidosFileRowGroupCount, EidosFileRowMutationResult, EidosFileRowPage, EidosFileSqlPrimitive, EidosFileTableSnapshot, EidosFileViewInfo, FileEntry } from "@eidos.space/eidos-file";
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
  onImportFiles?: () => Promise<FileEntry[]>;
  onImportDroppedFiles?: (files: File[], source?: "drop" | "paste") => Promise<FileEntry[]>;
  onSearchRelation?: (field: EidosFileFieldInfo, query: string) => Promise<EidosFileRelationValue[]>;
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
import { n as EidosFileEditorDataSource } from "./data-source-HASH.mjs";
import { EidosFileFieldInfo, EidosFileFilterGroup, EidosFileSort } from "@eidos.space/eidos-file";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/eidos-file-query-toolbar.d.ts
declare function EidosFileQueryToolbar({
  fields,
  filter,
  sorts,
  search,
  source,
  disabled,
  mutationsDisabled,
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
  source?: EidosFileEditorDataSource;
  disabled?: boolean;
  mutationsDisabled?: boolean;
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
  fixedHeight?: number;
  cardWidth?: number;
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
import { EidosFileFieldInfo, EidosFileRow } from "@eidos.space/eidos-file";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/eidos-file-record-delete-dialog.d.ts
declare function EidosFileRecordDeleteDialog({
  row,
  fields,
  disabled,
  onOpenChange,
  onDelete,
  onError
}: {
  row: EidosFileRow | null;
  fields?: EidosFileFieldInfo[];
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
import { EidosFileFieldInfo, EidosFileTableInfo, EidosFileTableSnapshot } from "@eidos.space/eidos-file";
import { ReactNode } from "react";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/eidos-file-sheet-tabs.d.ts
interface EidosFileSheetTabActions {
  canDelete: boolean;
  delete: () => void;
  deleteDisabledReason?: string;
  disabled: boolean;
  exportCsv?: () => void;
  exportDisabled: boolean;
  exportingCsv: boolean;
  rename: () => void;
  settings?: () => void;
}
type EidosFileSheetTabRenderer = (table: EidosFileTableInfo, tab: ReactNode, actions: EidosFileSheetTabActions) => ReactNode;
interface EidosFileSheetTabsProps {
  tables: EidosFileTableInfo[];
  tableSnapshots?: readonly EidosFileTableSnapshot[];
  activeTableId: string | null;
  disabled?: boolean;
  status?: ReactNode;
  createAction?: ReactNode;
  onSelect: (tableId: string) => void;
  onReorder?: (tableIds: string[]) => Promise<void> | void;
  onRename?: (table: EidosFileTableInfo, name: string) => Promise<void> | void;
  onDelete?: (table: EidosFileTableInfo) => Promise<void> | void;
  onExportCsv?: (table: EidosFileTableInfo) => Promise<void> | void;
  onSetRecordLabel?: (table: EidosFileTableSnapshot, field: EidosFileFieldInfo) => Promise<void> | void;
  onUpdateTableSettings?: (table: EidosFileTableSnapshot, changes: {
    recordLabelFieldId: string;
    contentFieldId: string | null;
  }) => Promise<void> | void;
  onExportError?: (error: unknown) => void;
  renderTab?: EidosFileSheetTabRenderer;
}
declare function EidosFileSheetTabs({
  tables,
  tableSnapshots,
  activeTableId,
  disabled,
  status,
  createAction,
  onSelect,
  onReorder,
  onRename,
  onDelete,
  onExportCsv,
  onSetRecordLabel,
  onUpdateTableSettings,
  onExportError,
  renderTab
}: EidosFileSheetTabsProps): _$react_jsx_runtime0.JSX.Element;
//#endregion
export { EidosFileSheetTabActions, EidosFileSheetTabRenderer, EidosFileSheetTabs, EidosFileSheetTabsProps };
```

## ./eidos-file-view-fields-popover

```ts
import { CreateEidosFileFieldInput, EidosFileFieldInfo, EidosFileViewInfo, UpdateEidosFileViewInput } from "@eidos.space/eidos-file";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/eidos-file-view-fields-popover.d.ts
/**
 * Shared saved-View field visibility and ordering control. Form Views expose
 * only writable input fields; other Views retain every configurable field.
 * It mutates only the active View's canonical layout keys.
 */
declare function EidosFileViewFieldsPopover({
  fields,
  view,
  disabled,
  className,
  onUpdate,
  onFieldOpen,
  onFieldAdd
}: {
  fields: EidosFileFieldInfo[];
  view: EidosFileViewInfo;
  disabled?: boolean;
  className?: string;
  onUpdate: (changes: UpdateEidosFileViewInput) => Promise<void> | void;
  onFieldOpen?: (field: EidosFileFieldInfo) => void;
  onFieldAdd?: (allowedTypes?: readonly CreateEidosFileFieldInput["type"][]) => void;
}): _$react_jsx_runtime0.JSX.Element;
//#endregion
export { EidosFileViewFieldsPopover };
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
type Panel = "list" | "create" | "manage" | "delete" | "card";
interface EidosFileViewCreateOptions {
  hiddenFields?: string[];
}
interface EidosFileViewSelectorRequest {
  anchorRect: Pick<DOMRect, "height" | "left" | "top" | "width">;
  focusName?: boolean;
  panel: Extract<Panel, "manage" | "delete">;
  requestId: number;
  viewId: string;
}
type EidosFileBuiltInViewType = "grid" | "gallery" | "kanban" | "calendar" | "form";
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
  onCreate: (name: string, type: string, options?: EidosFileViewCreateOptions) => Promise<void>;
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
export { EIDOS_FILE_EXTENSION_VIEW_PREFIX, EidosFileBuiltInViewType, EidosFileExternalViewContribution, EidosFileViewCreateOptions, EidosFileViewSelector, EidosFileViewSelectorRequest, eidosFileExtensionContributionId, eidosFileExtensionViewType, isEidosFileBuiltInViewType };
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
  exportCsv?: () => void;
  exportingCsv: boolean;
  rename: () => void;
}
type EidosFileViewTabRenderer = (view: EidosFileViewInfo, tab: ReactNode, actions: EidosFileViewTabActions) => ReactNode;
type EidosFileViewTabsProps = Omit<ComponentProps<typeof EidosFileViewSelector>, "request" | "triggerMode"> & {
  onExportCsv?: (view: EidosFileViewInfo) => Promise<void> | void;
  onExportError?: (error: unknown) => void;
  renderTab?: EidosFileViewTabRenderer;
};
declare function EidosFileViewTabs({
  onExportCsv,
  onExportError,
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
  paddingEnd?: number;
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
  paddingEnd,
  initialRect,
  overscan,
  useAnimationFrameWithResizeObserver
}: EidosFileBoundedVirtualizerOptions<TScrollElement, TItemElement>): EidosFileBoundedVirtualizerResult<TScrollElement, TItemElement>;
//#endregion
export { EIDOS_FILE_VIRTUAL_SCROLL_MAX_ITEMS, EIDOS_FILE_VIRTUAL_SCROLL_MAX_SIZE, EidosFileBoundedVirtualizerResult, EidosFileVirtualWindow, eidosFileVirtualItemOffset, eidosFileVirtualLogicalOffset, eidosFileVirtualPhysicalOffset, eidosFileVirtualPhysicalSize, eidosFileVirtualWindowForOffset, resetEidosFileVirtualizerMeasurements, useEidosFileBoundedVirtualizer };
```

## ./kernel

```ts
import { AssetLease, FieldDescriptor, FileEntry, GroupPage, GroupRequest, HostSaveResult, HostServiceCapabilities, HostServices, HostSessionState, MutationResult, ProjectedRow, ProjectionSpec, QueryRowsRequest, RowChange, RowPage, RowQuery, RuntimeCapabilities, RuntimeLimits, RuntimeSnapshot, SchemaDescriptor, TableDescriptor, ViewDescriptor } from "@eidos.space/eidos-file";

//#region src/kernel.d.ts
declare const EIDOS_UI_PROTOCOL: Readonly<{
  version: "1.0";
  labels: readonly ["EU-Viewer-1.0"];
  runtimeVersions: readonly ["1.0"];
  hostVersions: readonly ["1.0"];
  trustedRenderers: true;
  isolatedRenderers: false;
}>;
type EidosUIKernelPhase = "idle" | "opening" | "ready" | "error" | "closed";
interface EidosUISchemaIndex {
  objects: SchemaDescriptor[];
  tables: Map<string, TableDescriptor>;
  fields: Map<string, FieldDescriptor>;
  fieldsByTable: Map<string, FieldDescriptor[]>;
  views: Map<string, ViewDescriptor>;
  viewsByTable: Map<string, ViewDescriptor[]>;
}
interface EidosUIKernelState {
  phase: EidosUIKernelPhase;
  hostServiceCapabilities: HostServiceCapabilities | null;
  hostState: HostSessionState | null;
  sessionId: string | null;
  runtimeCapabilities: RuntimeCapabilities | null;
  runtimeLimits: RuntimeLimits | null;
  snapshot: RuntimeSnapshot | null;
  schema: EidosUISchemaIndex | null;
  error: unknown;
}
interface OpenEidosUISourceRequest {
  sourceToken: string;
  access: "read" | "readwrite";
}
interface EidosUIKernelOptions {
  /** A product may publish a lower bound than Runtime's negotiated maximum. */
  schemaObjectsMax?: number;
  pageSizeMax?: number;
  cachePagesMax?: number;
  cacheProjectedCellsMax?: number;
}
/**
 * Portable Eidos UI 1.0 session kernel. It receives only RuntimeClient and
 * HostServices, owns no SQLite/File-format behavior, and invalidates every
 * generated cache on a revision or Runtime epoch change.
 */
declare class EidosUIKernel {
  readonly host: HostServices;
  readonly options: EidosUIKernelOptions;
  private state;
  private runtime;
  private hostUnsubscribe;
  private runtimeUnsubscribe;
  private listeners;
  private requestSequence;
  private epochGeneration;
  private surfaceGenerations;
  private activeReads;
  private pageCache;
  private leases;
  constructor(host: HostServices, options?: EidosUIKernelOptions);
  getState: () => EidosUIKernelState;
  subscribe: (listener: () => void) => (() => void);
  negotiateHost(): Promise<void>;
  openSource(request: OpenEidosUISourceRequest): Promise<void>;
  createSource(request: {
    destinationToken: string;
    title: string;
  }): Promise<void>;
  queryRows(surfaceId: string, request: QueryRowsRequest): Promise<RowPage | null>;
  mutateRows(request: {
    tableId: string;
    changes: RowChange[];
    returning?: ProjectionSpec;
  }): Promise<MutationResult>;
  groupRows(surfaceId: string, request: GroupRequest): Promise<GroupPage | null>;
  save(): Promise<HostSaveResult>;
  requestWritePermission(): Promise<HostSessionState>;
  resolveAsset(entry: FileEntry, purpose: "thumbnail" | "preview" | "download"): Promise<AssetLease>;
  releaseAsset(leaseId: string): Promise<void>;
  refresh(): Promise<void>;
  close(options?: {
    discardDirty?: boolean;
  }): Promise<void>;
  private bootstrapRuntime;
  private loadSchema;
  private acceptMutationResult;
  private onHostState;
  private cachePage;
  private invalidateGeneratedState;
  private releaseSession;
  private prepareForNewSession;
  private requireRuntimeCapability;
  private requireSnapshot;
  private requireSession;
  private assertHostMutationAllowed;
  private assertNotClosed;
  private context;
  private nextRequestId;
  private setState;
}
/** Values are rendered without turning placeholders into canonical data. */
declare function eidosUIPresentValue(value: ProjectedRow["values"][number]): string;
declare function eidosUIVisibleFields(table: TableDescriptor, fields: FieldDescriptor[], view?: ViewDescriptor): FieldDescriptor[];
declare function eidosUIViewQuery(view?: ViewDescriptor, search?: string, searchFields?: string[]): RowQuery;
//#endregion
export { EIDOS_UI_PROTOCOL, EidosUIKernel, EidosUIKernelOptions, EidosUIKernelPhase, EidosUIKernelState, EidosUISchemaIndex, OpenEidosUISourceRequest, eidosUIPresentValue, eidosUIViewQuery, eidosUIVisibleFields };
```

## ./platform

```ts
import { a as EidosFileUIHost } from "./context-HASH.mjs";
import { S as EidosFileViewState, _ as EidosFileViewCommand, f as EidosFileEditorViewProps, x as EidosFileViewSelection } from "./plugin-HASH.mjs";
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
  locale,
  weekStartsOnMonday,
  timeZone,
  translate,
  assetSession,
  assetPresenter
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
}: EidosFileViewHostProps): string | number | boolean | Iterable<ReactNode> | _$react_jsx_runtime0.JSX.Element | null | undefined;
//#endregion
export { EidosFileProvider, EidosFileProviderProps, EidosFileReactContextValue, EidosFileReactTrust, EidosFileViewHost, EidosFileViewHostProps, useEidosFile, useEidosFileSession };
```

## ./plugin

```ts
import { a as EidosFilePluginSlot, c as defineEidosFilePlugin, i as EidosFilePluginRegistry, l as defineEidosFileView, n as EidosFilePlugin, o as EidosFileViewPluginContribution, r as EidosFilePluginContext, s as createEidosFilePluginRegistry, t as EidosFileActionPluginContribution } from "./plugin-HASH.mjs";
export { EidosFileActionPluginContribution, EidosFilePlugin, EidosFilePluginContext, EidosFilePluginRegistry, EidosFilePluginSlot, EidosFileViewPluginContribution, createEidosFilePluginRegistry, defineEidosFilePlugin, defineEidosFileView };
```

## ./plugins/calendar

```ts
import { EidosFileCalendarRange } from "../eidos-file-calendar-view.mjs";
import { y as EidosFileViewRendererProps } from "../plugin-HASH.mjs";
import { EidosFileFieldInfo, EidosFileFilterGroup } from "@eidos.space/eidos-file";
import * as _$react from "react";
import * as _$lucide_react0 from "lucide-react";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/plugins/calendar.d.ts
declare function eidosFileCalendarRangeFilter(current: EidosFileFilterGroup | null | undefined, field: EidosFileFieldInfo, range: EidosFileCalendarRange, timeZone?: string): EidosFileFilterGroup;
declare function EidosFileCalendarRenderer(props: EidosFileViewRendererProps): _$react_jsx_runtime0.JSX.Element | null;
declare const eidosFileCalendarPlugin: {
  id: string;
  views: {
    type: string;
    label: string;
    description: string;
    icon: _$react.ForwardRefExoticComponent<Omit<_$lucide_react0.LucideProps, "ref"> & _$react.RefAttributes<SVGSVGElement>>;
    renderer: typeof EidosFileCalendarRenderer;
    create: {
      defaultName: string;
      isAvailable: (fields: readonly EidosFileFieldInfo[]) => boolean;
      properties: (fields: readonly EidosFileFieldInfo[]) => {
        dateField: string;
        calendarLayout: string;
      } | undefined;
    };
  }[];
};
//#endregion
export { eidosFileCalendarPlugin, eidosFileCalendarRangeFilter };
```

## ./plugins/csv-import

```ts
import { t as EidosFileCsvOperationProgress } from "../eidos-file-csv-operation-progress-HASH.mjs";
import { r as EidosFilePluginContext } from "../plugin-HASH.mjs";
import { EidosFileCsvImportOptions, EidosFileCsvImportPlan, EidosFileCsvImportResult, EidosFileSnapshot } from "@eidos.space/eidos-file";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/plugins/csv-import.d.ts
interface EidosFileCsvImportSource {
  id: string;
  fileName: string;
}
interface EidosFileCsvImportAdapter {
  pickFile(): Promise<EidosFileCsvImportSource | null>;
  preview(source: EidosFileCsvImportSource, options: EidosFileCsvImportOptions, operationId: string): Promise<EidosFileCsvImportPlan>;
  import(source: EidosFileCsvImportSource, options: EidosFileCsvImportOptions, operationId: string): Promise<{
    snapshot: EidosFileSnapshot;
    result: EidosFileCsvImportResult;
  }>;
  progress?(operationId: string): Promise<EidosFileCsvOperationProgress | null>;
  cancel?(operationId: string): Promise<boolean>;
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

## ./plugins/form

```ts
import { EidosFileFormView } from "../eidos-file-form-view.mjs";
import * as _$_eidos_space_eidos_file0 from "@eidos.space/eidos-file";
import * as _$react from "react";
import * as _$lucide_react0 from "lucide-react";

//#region src/plugins/form.d.ts
declare const eidosFileFormPlugin: {
  id: string;
  views: {
    type: string;
    label: string;
    description: string;
    icon: _$react.ForwardRefExoticComponent<Omit<_$lucide_react0.LucideProps, "ref"> & _$react.RefAttributes<SVGSVGElement>>;
    renderer: typeof EidosFileFormView;
    create: {
      defaultName: string;
      isAvailable: (fields: readonly _$_eidos_space_eidos_file0.EidosFileFieldInfo[]) => boolean;
      properties: (fields: readonly _$_eidos_space_eidos_file0.EidosFileFieldInfo[]) => Record<string, unknown>;
    };
  }[];
};
//#endregion
export { eidosFileFormPlugin };
```

## ./plugins/gallery

```ts
import { y as EidosFileViewRendererProps } from "../plugin-HASH.mjs";
import { EidosFileFieldInfo } from "@eidos.space/eidos-file";
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
      properties: (fields: readonly EidosFileFieldInfo[]) => {
        cardFields: string[];
        cardSize: string;
        coverFit: string;
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
import { y as EidosFileViewRendererProps } from "../plugin-HASH.mjs";
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
        groupField?: string | undefined;
        cardFields: string[];
        cardSize: string;
        coverFit: string;
        hideEmptyFields: boolean;
      };
    };
  }[];
};
//#endregion
export { eidosFileKanbanPlugin };
```

## ./runtime-platform

```ts
import { t as AssetPresenter } from "./context-HASH.mjs";
import { EidosUIKernel, EidosUIKernelState } from "./kernel.mjs";
import { CSSProperties, ReactNode } from "react";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";

//#region src/runtime-platform.d.ts
interface EidosUIRuntimeContextValue {
  kernel: EidosUIKernel;
  state: EidosUIKernelState;
}
interface EidosUIRuntimeProviderProps {
  kernel: EidosUIKernel;
  children: ReactNode;
  themeName?: "light" | "dark";
  /** Host-selected IANA time zone; absent follows the current system zone. */
  timeZone?: string;
  assetPresenter?: AssetPresenter<ReactNode>;
  className?: string;
  style?: CSSProperties;
}
/** The normative React boundary: one exact UI kernel, no file path or SQL. */
declare function EidosUIRuntimeProvider({
  kernel,
  children,
  themeName,
  timeZone,
  assetPresenter,
  className,
  style
}: EidosUIRuntimeProviderProps): _$react_jsx_runtime0.JSX.Element;
declare function useEidosUIRuntime(): EidosUIRuntimeContextValue;
interface EidosStandardViewProps {
  tableId?: string;
  viewId?: string;
  search?: string;
  pageSize?: number;
  className?: string;
  renderEmpty?: (state: EidosUIKernelState) => ReactNode;
}
/**
 * Accessible EU-Viewer-1.0 renderer for the four standard View types. All
 * rows, order, groups, derived values and Relation labels come from Runtime.
 */
declare function EidosStandardView({
  tableId,
  viewId,
  search,
  pageSize,
  className,
  renderEmpty
}: EidosStandardViewProps): string | number | boolean | Iterable<ReactNode> | _$react_jsx_runtime0.JSX.Element | null | undefined;
//#endregion
export { EidosStandardView, EidosStandardViewProps, EidosUIRuntimeContextValue, EidosUIRuntimeProvider, EidosUIRuntimeProviderProps, useEidosUIRuntime };
```

## ./ui/alert-dialog

```ts
import * as React$1 from "react";
import * as _$react_jsx_runtime0 from "react/jsx-runtime";
import { AlertDialog as AlertDialog$1 } from "radix-ui";

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
import * as _$react_jsx_runtime0 from "react/jsx-runtime";
import { DropdownMenu as DropdownMenu$1 } from "radix-ui";

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
declare const KanbanHeader: (props: KanbanHeaderProps) => string | number | boolean | Iterable<React.ReactNode> | _$react_jsx_runtime0.JSX.Element | null | undefined;
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
