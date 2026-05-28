import { Message } from "ai";
import * as postal_mime9 from "postal-mime";
import { JsonSchema7ObjectType } from "zod-to-json-schema";

//#region fields/const.d.ts
declare enum FieldType {
  Number = "number",
  Text = "text",
  Title = "title",
  Checkbox = "checkbox",
  Date = "date",
  DateTime = "datetime",
  File = "file",
  MultiSelect = "multi-select",
  Rating = "rating",
  Select = "select",
  URL = "url",
  Formula = "formula",
  Link = "link",
  Lookup = "lookup",
  CreatedTime = "created-time",
  CreatedBy = "created-by",
  LastEditedTime = "last-edited-time",
  LastEditedBy = "last-edited-by",
}
declare enum CompareOperator {
  IsEmpty = "IsEmpty",
  IsNotEmpty = "IsNotEmpty",
  Equal = "=",
  NotEqual = "!=",
  Contains = "Contains",
  NotContains = "NotContains",
  StartsWith = "StartsWith",
  EndsWith = "EndsWith",
  GreaterThan = ">",
  GreaterThanOrEqual = ">=",
  LessThan = "<",
  LessThanOrEqual = "<=",
}
declare enum BinaryOperator {
  And = "AND",
  Or = "OR",
}
//#endregion
//#region types/IField.d.ts
type IField<T = any> = {
  name: string;
  type: FieldType | `${FieldType}`;
  table_column_name: string;
  table_name: string;
  property: T;
  created_at?: string;
  updated_at?: string;
};
//# sourceMappingURL=IField.d.ts.map
//#endregion
//#region fields/link.d.ts
type ILinkProperty = {
  linkTableName: string;
  linkColumnName: string;
};
//#endregion
//#region fields/lookup.d.ts
type ILookupProperty = {
  linkFieldId: string;
  lookupTargetFieldId: string;
};
/**
 * a -> b -> c -> d ....
 * if a&b&c&d are lookup field, we need to get the lookup fields map from a to d
 * walk through the lookup fields, and get the lookup fields map
 */
type ILookupContext = {
  linkField: IField<ILinkProperty> | null;
  lookupTargetFieldsMap: {
    [lookupTargetTableId: string]: {
      [fieldId: string]: {
        field: IField<any>;
        context: ILookupContext | null;
      };
    };
  };
};
//#endregion
//#region types/IViewFilter.d.ts
interface IFilterValue {
  operator: CompareOperator;
  operands: [field: string, value: string | number | boolean | Date | null | undefined];
}
interface IGroupFilterValue {
  operator: BinaryOperator;
  operands: (IFilterValue | IGroupFilterValue)[];
}
type FilterValueType = IFilterValue | IGroupFilterValue;
//# sourceMappingURL=IViewFilter.d.ts.map
//#endregion
//#region types/IView.d.ts
declare enum ViewTypeEnum {
  Grid = "grid",
  Gallery = "gallery",
  DocList = "doc_list",
  Kanban = "kanban",
}
type ViewType = ViewTypeEnum | `${ViewTypeEnum}` | `ext__${string}`;
interface IView<T = any> {
  id: string;
  name: string;
  type: ViewTypeEnum | `${ViewTypeEnum}` | `ext__${string}`;
  table_id: string;
  query: string;
  fieldIds?: string[];
  properties?: T;
  filter?: FilterValueType;
  order_map?: Record<string, number>;
  hidden_fields?: string[];
  position?: number;
}
//#endregion
//#region sdk/schema.d.ts
interface CreateTableInput {
  /** Table display name */
  name: string;
  /** Field definitions (system fields like _id, title, timestamps are auto-created) */
  fields: CreateFieldInput[];
}
interface CreateFieldInput {
  /** Field display name */
  name: string;
  /** Database column name (required, must be valid SQLite identifier) */
  columnName: string;
  /** Field type */
  type: FieldType | `${FieldType}`;
  /** Field-type-specific properties (e.g., select options, link config) */
  property?: Record<string, any>;
}
interface UpdateTableInput {
  /** New table display name */
  name?: string;
}
interface UpdateFieldInput {
  /** New display name */
  name?: string;
  /** Updated field-type-specific properties */
  property?: Record<string, any>;
}
interface CreateViewInput {
  /** View display name */
  name: string;
  /** View type */
  type: ViewType;
}
interface TableInfo {
  id: string;
  name: string;
  fields: FieldInfo[];
  views: ViewInfo[];
}
interface FieldInfo {
  /** Display name */
  name: string;
  /** Database column name */
  columnName: string;
  /** Field type */
  type: FieldType | `${FieldType}`;
  /** Field-type-specific properties */
  property?: Record<string, any>;
}
interface ViewInfo {
  id: string;
  name: string;
  type: ViewType;
}
interface TableListItem {
  id: string;
  name: string;
}
/**
 * Portable schema representation for import/export.
 * Encodes table structure (name + fields) without any IDs,
 * so it can be shared and used to recreate tables.
 */
interface TableSchemaExport {
  /** Schema format version */
  version: 1;
  /** Table display name */
  name: string;
  /** Field definitions (system fields excluded) */
  fields: CreateFieldInput[];
}
/**
 * Schema management client for table/field/view lifecycle operations.
 *
 * Access via `eidos.currentSpace.schema.*`
 *
 * @example
 * ```typescript
 * // Create a table
 * const table = await eidos.currentSpace.schema.createTable({
 *   name: "Tasks",
 *   fields: [
 *     { name: "Status", columnName: "status", type: "select" },
 *     { name: "Due Date", columnName: "due_date", type: "date" },
 *     { name: "Priority", columnName: "priority", type: "number" },
 *   ]
 * })
 *
 * // Then use Prisma-style CRUD
 * const Tasks = eidos.currentSpace.table(table.id)
 * await Tasks.create({ data: { title: "Design API", status: "In Progress" } })
 * ```
 */
declare class SchemaClient {
  private dataSpace;
  constructor(dataSpace: DataSpaceWithTable);
  /**
   * Create a new table with the given fields.
   * System fields (_id, title, _created_time, etc.) are auto-created.
   *
   * @param input Table name and field definitions
   * @returns Created table info including generated id, fields, and default view
   */
  createTable(input: CreateTableInput): Promise<TableInfo>;
  /**
   * Get full table info including fields and views.
   * @param tableId Table ID
   */
  getTable(tableId: string): Promise<TableInfo>;
  /**
   * List all tables in the current space.
   */
  listTables(): Promise<TableListItem[]>;
  /**
   * Update table metadata (e.g., rename).
   * @param tableId Table ID
   * @param input Fields to update
   */
  updateTable(tableId: string, input: UpdateTableInput): Promise<TableInfo>;
  /**
   * Delete a table and all associated data (fields, views, records).
   * @param tableId Table ID
   */
  deleteTable(tableId: string): Promise<boolean>;
  /**
   * Add a field to an existing table.
   * @param tableId Table ID
   * @param input Field definition
   */
  addField(tableId: string, input: CreateFieldInput): Promise<FieldInfo>;
  /**
   * Update field metadata (display name, properties).
   * @param tableId Table ID
   * @param columnName Database column name of the field to update
   * @param input Fields to update
   */
  updateField(tableId: string, columnName: string, input: UpdateFieldInput): Promise<FieldInfo>;
  /**
   * Delete a field from a table.
   * @param tableId Table ID
   * @param columnName Database column name of the field to delete
   */
  deleteField(tableId: string, columnName: string): Promise<boolean>;
  /**
   * List all fields in a table.
   * @param tableId Table ID
   */
  listFields(tableId: string): Promise<FieldInfo[]>;
  /**
   * Create a new view for a table.
   * @param tableId Table ID
   * @param input View definition
   */
  createView(tableId: string, input: CreateViewInput): Promise<ViewInfo>;
  /**
   * List all views for a table.
   * @param tableId Table ID
   */
  listViews(tableId: string): Promise<ViewInfo[]>;
  /**
   * Delete a view.
   * @param tableId Table ID (for validation)
   * @param viewId View ID
   */
  deleteView(tableId: string, viewId: string): Promise<boolean>;
  /**
   * Export a table's schema as a portable object.
   * The returned value can be JSON-stringified and base64-encoded for sharing.
   * System fields (_id, title, _created_time, etc.) are excluded.
   *
   * @param tableId Table ID
   * @returns Portable schema object
   *
   * @example
   * ```typescript
   * const schema = await eidos.currentSpace.schema.export(tableId)
   * const encoded = btoa(JSON.stringify(schema))
   * // share `encoded` with others
   * ```
   */
  export(tableId: string): Promise<TableSchemaExport>;
  /**
   * Create a new table from a previously exported schema.
   * This is the counterpart to `schema.export()`.
   *
   * @param schema Schema exported via `schema.export()` (or decoded from base64)
   * @param nameOverride Optional new name for the table (defaults to schema name)
   * @returns Created table info
   *
   * @example
   * ```typescript
   * const schema = JSON.parse(atob(encodedSchema)) as TableSchemaExport
   * const table = await eidos.currentSpace.schema.import(schema)
   * ```
   */
  import(schema: TableSchemaExport, nameOverride?: string): Promise<TableInfo>;
}
//# sourceMappingURL=schema.d.ts.map
//#endregion
//#region sdk/index-manager.d.ts
declare class IndexManager {
  private table;
  dataSpace: DataSpaceWithTable;
  tableManager: TableManager;
  constructor(table: TableManager);
  createIndex(column: string, onStart?: () => void, onEnd?: () => void): Promise<void>;
}
//# sourceMappingURL=index-manager.d.ts.map
//#endregion
//#region sqlite/sql-query-builder.d.ts
interface FindManyOptions<T = any> {
  where?: Partial<T> | WhereCondition<T>;
  orderBy?: OrderByOption<T> | OrderByOption<T>[];
  skip?: number;
  take?: number;
  select?: Partial<Record<keyof T, boolean>>;
  include?: Partial<Record<keyof T, boolean>>;
}
interface WhereCondition<T = any> {
  AND?: (WhereCondition<T> | Partial<T>)[];
  OR?: (WhereCondition<T> | Partial<T>)[];
  NOT?: WhereCondition<T> | Partial<T>;
  [key: string]: any;
}
interface OrderByOption<T = any> {
  [key: string]: "asc" | "desc" | undefined;
}
//#endregion
//#region sdk/rows.d.ts
declare class RowsManager {
  private table;
  dataSpace: DataSpaceWithTable;
  fieldMap?: {
    fieldRawColumnNameFieldMap: Record<string, IField>;
    fieldNameRawColumnNameMap: Record<string, string>;
  };
  tableManager: TableManager;
  constructor(table: TableManager);
  static getReadableRows(rows: Record<string, any>[], fields: IField[]): Record<string, any>[];
  getFieldMap(): Promise<{
    fieldRawColumnNameFieldMap: Record<string, IField>;
    fieldNameRawColumnNameMap: Record<string, string>;
  }>;
  static rawData2Json(row: Record<string, any>, fieldRawColumnNameFieldMap: Record<string, IField>): Record<string, any>;
  transformData(data: Record<string, any>, context: {
    fieldNameRawColumnNameMap: Record<string, string>;
    fieldRawColumnNameFieldMap: Record<string, IField>;
  }, options?: {
    useFieldId?: boolean;
  }): {
    notExistKeys: string[];
    rawData: {
      [k: string]: any;
    };
  };
  /**
   * get row by id
   * @param id
   * @returns
   */
  get(id: string, options?: {
    raw?: boolean;
    withRowId?: boolean;
  }): Promise<any>;
  /**
   * @deprecated Use findMany instead. This method will be removed in a future version.
   * @param filter a filter object, the key is field name, the value is field value
   * @param options
   * @returns
   */
  query(filter?: Record<string, any>, options?: {
    viewId?: string;
    limit?: number;
    offset?: number;
    raw?: boolean;
    select?: string[];
    rawQuery?: string;
  }): Promise<Record<string, any>[]>;
  getCreateData(data: Record<string, any>): Record<string, any>;
  getUpdateData(data: Record<string, any>): {
    _last_edited_time: string;
    _last_edited_by: string | null;
  };
  /**
   * for high performance, use transaction
   * @param datas
   * @param fieldMap
   * @param options
   * @returns
   */
  batchSyncCreate(datas: Record<string, any>[], fieldMap: {
    fieldRawColumnNameFieldMap: Record<string, IField>;
    fieldNameRawColumnNameMap: Record<string, string>;
  }, options?: {
    useFieldId?: boolean;
  }): Record<string, any>[];
  batchCreate(datas: Record<string, any>[], options?: {
    useFieldId?: boolean;
    returnReadableData?: boolean;
  }): Promise<Record<string, any>[]>;
  create(data: Record<string, any>, options?: {
    useFieldId?: boolean;
  }): Promise<Record<string, any>>;
  delete(id: string): Promise<boolean>;
  batchDelete(ids: string[]): Promise<boolean>;
  private updateCellSideEffect;
  update(id: string, data: Record<string, any>, options?: {
    useFieldId?: boolean;
  }): Promise<{
    _last_edited_time: string;
    _last_edited_by: string | null;
    id: string;
  }>;
  /**
   * highlight the row if it is in the current view
   * @param id row id
   */
  highlight(id: string): Promise<void>;
  /**
   * Find many rows with advanced query options
   * @param options Query options including where, orderBy, skip, take, select
   * @returns Array of transformed rows
   */
  findMany(options?: FindManyOptions<Record<string, any>>): Promise<Record<string, any>[]>;
  /**
   * Count rows with advanced query options
   * @param options Query options excluding select, orderBy, skip, take
   * @returns Count of matching rows
   */
  count(options?: Omit<FindManyOptions<Record<string, any>>, "select" | "orderBy" | "skip" | "take">): Promise<number>;
}
//# sourceMappingURL=rows.d.ts.map
//#endregion
//#region ../lib/const.d.ts
declare enum MsgType {
  SetConfig = "SetConfig",
  CallFunction = "CallFunction",
  SwitchDatabase = "SwitchDatabase",
  CreateSpace = "CreateSpace",
  Syscall = "Syscall",
  Status = "Status",
  Pull = "Pull",
  Push = "Push",
  Fetch = "Fetch",
  Hydrate = "Hydrate",
  Snapshot = "Snapshot",
  Info = "Info",
  Audit = "Audit",
  Version = "Version",
  Volumes = "Volumes",
  Error = "Error",
  QueryResp = "QueryResp",
  Notify = "Notify",
  BlockUIMsg = "BlockUIMsg",
  Navigate = "Navigate",
  DataUpdateSignal = "DataUpdateSignal",
  WebSocketConnected = "WebSocketConnected",
  WebSocketDisconnected = "WebSocketDisconnected",
  IteratorValue = "IteratorValue",
  IteratorDone = "IteratorDone",
  IteratorError = "IteratorError",
  IteratorCancel = "IteratorCancel",
  ConvertMarkdown2State = "ConvertMarkdown2State",
  ConvertHtml2State = "ConvertHtml2State",
  ConvertEmail2State = "ConvertEmail2State",
  GetDocMarkdown = "GetDocMarkdown",
  HighlightRow = "HighlightRow",
  GetTheme = "GetTheme",
  SetTheme = "SetTheme",
  ListThemes = "ListThemes",
  SetCurrentTheme = "SetCurrentTheme",
  ApplyTheme = "ApplyTheme",
}
//#endregion
//#region sqlite/interface.d.ts
type CommonVersionControlResult = Promise<Record<string, any>>;
declare abstract class BaseServerDatabase {
  filename?: string;
  get isWalMode(): boolean;
  /**
   * Check if currently inside a transaction.
   * Returns true if a transaction is active.
   */
  abstract get inTransaction(): boolean;
  info(): CommonVersionControlResult;
  status(): CommonVersionControlResult;
  snapshot(): CommonVersionControlResult;
  tags(): CommonVersionControlResult;
  volumes(): CommonVersionControlResult;
  audit(): CommonVersionControlResult;
  version(): CommonVersionControlResult;
  hydrate(): CommonVersionControlResult;
  fetch(): CommonVersionControlResult;
  pull(): CommonVersionControlResult;
  push(): CommonVersionControlResult;
  clone(remoteLogId?: string): CommonVersionControlResult;
  convertToGraft(remote: string): CommonVersionControlResult;
  exportToSqlite(outputPath?: string): CommonVersionControlResult;
  abstract prepare(sql: string): {
    run: (bind?: any[]) => void;
    all: (bind?: any[]) => Promise<any[]>;
  };
  abstract close(): void;
  abstract selectObjects(sql: string, bind?: any[]): Promise<{
    [columnName: string]: any;
  }[]>;
  abstract transaction(func: (db: BaseServerDatabase) => void): any;
  abstract exec(opts: string | {
    sql: string;
    bind?: any[];
    rowMode?: "array" | "object";
    returnValue?: "resultRows" | "saveSql";
  }): Promise<any>;
  abstract createFunction(opt: {
    name: string;
    xFunc: (...args: any[]) => any;
    deterministic: boolean;
    nArg?: number;
  }): any;
  abstract table(name: string, options: {
    rows: (...params: unknown[]) => Generator;
    columns: string[];
    parameters?: string[];
    safeIntegers?: boolean;
    directOnly?: boolean;
  }): any;
  abstract selectObjectsSync(sql: string, bind?: any[]): {
    [columnName: string]: any;
  }[];
}
//#endregion
//#region sdk/service/link.d.ts
interface IRelation {
  self: string;
  ref: string;
  link_field_id: string;
}
declare class LinkFieldService {
  private table;
  dataSpace: DataSpaceWithTable;
  db: EidosDatabase;
  constructor(table: TableManager);
  getEffectRowsByRelationDeleted: (relationTableName: string, relation: IRelation, db?: BaseServerDatabase) => Promise<{
    [x: string]: any;
  }>;
  /**
   * get diff between new value and old value
   * eg: new value is "1,2,3", old value is "1,2,3,4" => added: [], removed: [4]
   * eg: new value is "1,2,3,4", old value is "1,3" => added: [2,4], removed: []
   * eg: new value is "1,2,3,4", old value is "1,2,3,4" => added: [], removed: []
   * eg: new value is null, old value is "1,2,3,4" => added: [], removed: [1,2,3,4]
   * eg: new value is "1,2,3,4", old value is null => added: [1,2,3,4], removed: []
   * eg: new value is "1,3,4,5", old value is "1,2,3,4" => added: [5], removed: [2]
   * eg: new value is "1", old value is "2" => added: [1], removed: [2]
   * @param newValue
   * @param oldValue
   */
  getDiff: (newValue: string | null, oldValue: string | null) => {
    added: string[];
    removed: string[];
  };
  getEffectRows: (table_name: string, rowIds: string[], db?: BaseServerDatabase) => Promise<Record<string, string[]>>;
  getTableNodeName: (tableName: string) => Promise<string>;
  getPairedLinkField: (data: IField<ILinkProperty>) => Promise<{
    name: string;
    type: FieldType;
    table_name: string;
    table_column_name: string;
    property: ILinkProperty;
  }>;
  getRelationTableName: (field: IField<ILinkProperty>) => string;
  getParentRelationTableName: (field: IField<ILinkProperty>) => string;
  getLinkCellTitle: (field: IField<ILinkProperty>, value: string | null) => Promise<string | null>;
  private getLinkCellValue;
  updateLinkCell: (tableName: string, tableColumnName: string, rowIds: string[]) => Promise<void>;
  /**
   * when user setCell, we also need to update the paired link field and update relation table
   * @param field
   * @param rowId
   * @param value
   * @param oldValue
   */
  updateLinkRelation: (field: IField<ILinkProperty>, rowId: string, value: string | null, oldValue: string | null) => Promise<void>;
  /**
   * when user add a link field, we also need to add a paired link field and create relation table and set trigger
   * @param data
   * @param db
   * @returns
   */
  addField: (data: IField<ILinkProperty>, db?: BaseServerDatabase) => Promise<BaseServerDatabase>;
  /**
   * when user delete a table, we need check if there are link fields in the table, if so, we need to delete the paired link field and delete relation table and delete trigger
   */
  beforeDeleteTable(tableName: string, db?: BaseServerDatabase): Promise<void>;
  /**
   * when user delete a link field, we also need to delete the paired link field and delete relation data
   */
  beforeDeleteColumn(tableName: string, columnName: string, db?: BaseServerDatabase): Promise<void>;
}
//#endregion
//#region sdk/service/lookup.d.ts
declare class LookupFieldService {
  private table;
  dataSpace: DataSpaceWithTable;
  constructor(table: TableManager);
  /**
   * find all fields that lookup field depends on
   */
  getLookupContext: (tableName: string, tableColumnName: string) => Promise<ILookupContext | null>;
  onPropertyChange: (field: IField<ILookupProperty>, newProperty: ILookupProperty) => Promise<void>;
  /**
   * <linkField>__title field can be treated as a lookup field and the lookupTargetField is the title field
   */
  getLinkTitleContext: (tableName: string, tableColumnName: string) => Promise<{
    targetTableColumnName: string;
    targetTableName: string;
    linkFieldId: string;
  } | undefined>;
  _getLookupContext: (tableName: string, tableColumnName: string) => Promise<{
    targetTableColumnName: string;
    targetTableName: string;
    linkFieldId: string;
  } | undefined>;
  getFieldContext: (tableName: string, tableColumnName: string) => Promise<{
    targetTableColumnName: string;
    targetTableName: string;
    linkFieldId: string;
  } | undefined>;
  /**
   *
   * @param id table_column_name
   */
  updateColumn: (data: {
    tableName: string;
    tableColumnName: string;
    db?: BaseServerDatabase;
    rowIds?: string[];
  }) => Promise<void>;
}
//# sourceMappingURL=lookup.d.ts.map
//#endregion
//#region fields/select.d.ts
type SelectOption = {
  id: string;
  name: string;
  color: string;
};
type SelectProperty = {
  options: SelectOption[];
  defaultOption?: string;
};
//#endregion
//#region sdk/service/multi-select.d.ts
declare class MultiSelectFieldService {
  private table;
  dataSpace: DataSpaceWithTable;
  constructor(table: TableManager);
  updateFieldPropertyIfNeed: (field: IField<SelectProperty>, value: string) => Promise<void>;
  updateSelectOptionName: (field: IField<SelectProperty>, update: {
    from: string;
    to: string;
  }) => Promise<void>;
  deleteSelectOption: (field: IField<SelectProperty>, option: string) => Promise<void>;
}
//# sourceMappingURL=multi-select.d.ts.map
//#endregion
//#region sdk/service/select.d.ts
declare class SelectFieldService {
  private table;
  dataSpace: DataSpaceWithTable;
  constructor(table: TableManager);
  static MAX_SELECT_OPTIONS: number;
  updateFieldPropertyIfNeed: (field: IField<SelectProperty>, value: string) => Promise<void>;
  updateSelectOptionName: (field: IField<SelectProperty>, update: {
    from: string;
    to: string;
  }) => Promise<void>;
  deleteSelectOption: (field: IField<SelectProperty>, option: string) => Promise<void>;
  beforeConvert: (field: IField<any>, db?: BaseServerDatabase) => Promise<{
    id: string;
    name: string;
    color: string;
  }[]>;
}
//# sourceMappingURL=select.d.ts.map
//#endregion
//#region fields/text.d.ts
interface TextProperty {
  model?: string | null;
  enableEmbedding?: boolean | null;
  enableColorHint?: boolean | null;
}
//#endregion
//#region sdk/service/text.d.ts
declare class TextFieldService {
  private table;
  dataSpace: DataSpaceWithTable;
  constructor(table: TableManager);
  queryEmbedding: (fieldId: string, query: string, limit?: number) => Promise<any>;
  updateEmbedding: (fieldId: string, data: {
    recordId: string;
    value: string;
  }[]) => Promise<void>;
  resetEmbedding: (fieldId: string) => Promise<void>;
  onPropertyChange: (oldField: IField<TextProperty>, property: TextProperty) => Promise<void>;
  /**
   * when user delete a link field, we also need to delete the paired link field and delete relation data
   */
  beforeDeleteColumn(tableName: string, columnName: string, db?: BaseServerDatabase): Promise<void>;
  /**
   * Get statistics about the embedding status for a text field
   * @param fieldId The field ID to get statistics for
   * @returns Statistics about vectorization status
   */
  getEmbeddingStats(fieldId: string): Promise<{
    total: number;
    vectorized: number;
    outdated: number;
    upToDate: number;
    vectorizedPercentage: number;
    outdatedPercentage: number;
    upToDatePercentage: number;
  }>;
}
//# sourceMappingURL=text.d.ts.map
//#endregion
//#region sdk/service/index.d.ts
declare class FieldsManager {
  private table;
  dataSpace: DataSpaceWithTable;
  constructor(table: TableManager);
  all(): Promise<IField[]>;
  get lookup(): LookupFieldService;
  get select(): SelectFieldService;
  get multiSelect(): MultiSelectFieldService;
  get link(): LinkFieldService;
  get text(): TextFieldService;
}
//# sourceMappingURL=index.d.ts.map
//#endregion
//#region sdk/service/compute.d.ts
declare class ComputeService {
  private dataSpace;
  constructor(dataSpace: DataSpaceWithTable);
  updateEffectCells: (signal: {
    table: string;
    rowId: string;
    diff: Record<string, {
      old: any;
      new: any;
    }>;
    diffKeys: string[];
  }) => Promise<void>;
}
//# sourceMappingURL=compute.d.ts.map
//#endregion
//#region sdk/table.d.ts
interface ITable {
  id: string;
  name: string;
  views: IView[];
}
declare class TableManager {
  id: string;
  dataSpace: DataSpaceWithTable;
  rawTableName: string;
  db: EidosDatabase;
  constructor(id: string, dataSpace: DataSpaceWithTable);
  get compute(): ComputeService;
  get rows(): RowsManager;
  get fields(): FieldsManager;
  get index(): IndexManager;
  isExist(id: string): Promise<boolean>;
  get(id: string): Promise<ITable | null>;
  del(id: string): Promise<boolean>;
  hasSystemColumn(tableId: string, column: string): Promise<any>;
  fixTable(tableId: string): Promise<void>;
  /**
   * Migrate file paths in file fields from old format (/{spaceName}/files/) to new format (/files/)
   * @returns Migration statistics
   */
  migrateFilePaths(): Promise<{
    migrated: number;
    errors: number;
  }>;
  /**
   * Detect and fix orphan __title columns that don't have corresponding link fields
   * This can happen when link fields were deleted incorrectly in older versions
   * @returns Object with arrays of fixed columns and any errors
   */
  fixOrphanTitleColumns(): Promise<{
    fixed: string[];
    errors: string[];
  }>;
  /**
   * Check if this table has orphan __title columns that need fixing
   * @returns True if there are orphan columns
   */
  hasOrphanTitleColumns(): Promise<boolean>;
  /**
   * Check if this table needs file path migration
   * @returns True if migration is needed
   */
  needsFilePathMigration(): Promise<boolean>;
  static generateCreateTableSql(fields: Array<{
    name: string;
    type: FieldType;
  }>): {
    tableId: string;
    createTableSql: string;
  };
}
//#endregion
//#region sdk/table-client.d.ts
/**
 * Minimal interface for DataSpace dependency
 * This allows TableClient to work with any class in the DataSpace inheritance chain
 */
interface ITableClientDataSpace {
  db: {
    prepare: (sql: string) => {
      run: (values: any[]) => void;
    };
  };
  exec2: (sql: string, bind?: any[]) => Promise<any[]>;
  undoRedoManager: {
    event: () => void;
  };
}
/**
 * Prisma-style Table SDK client for CRUD operations
 *
 * This client operates directly on database column names (e.g., `cl_xxx`)
 * rather than UI display field names for simplicity and performance.
 *
 * @example
 * ```typescript
 * const Users = eidos.currentSpace.tableClient("users")
 *
 * // Create
 * await Users.create({ data: { cl_name: "张三", cl_email: "z@example.com" } })
 *
 * // Read
 * const user = await Users.findUnique({ where: { _id: "rec123" } })
 * const users = await Users.findMany({ where: { cl_age: { gte: 18 } }, take: 50 })
 *
 * // Update
 * await Users.update({ where: { _id: "rec123" }, data: { cl_age: 30 } })
 *
 * // Delete
 * await Users.delete({ where: { _id: "rec123" } })
 * ```
 */
declare class TableClient<T extends Record<string, any> = Record<string, any>> {
  private rawTableName;
  private dataSpace;
  constructor(rawTableName: string, dataSpace: ITableClientDataSpace);
  /**
   * Create a single record
   * @param args.data Record data to insert
   * @returns Created record with generated _id and timestamps
   */
  create(args: {
    data: T;
  }): Promise<T & {
    _id: string;
  }>;
  /**
   * Create multiple records in a batch
   * @param args.data Array of records to insert
   * @param args.skipDuplicates If true, skip records that would cause unique constraint violations
   * @returns Array of created records
   */
  createMany(args: {
    data: T[];
    skipDuplicates?: boolean;
  }): Promise<{
    count: number;
  }>;
  /**
   * Find a unique record by _id
   * @param args.where Where clause with _id
   * @returns Found record or null
   */
  findUnique(args: {
    where: {
      _id: string;
    };
  }): Promise<T | null>;
  /**
   * Find the first record matching the conditions
   * @param args.where Optional where conditions
   * @param args.orderBy Optional ordering
   * @returns First matching record or null
   */
  findFirst(args?: {
    where?: FindManyOptions<T>["where"];
    orderBy?: FindManyOptions<T>["orderBy"];
  }): Promise<T | null>;
  /**
   * Find multiple records with advanced query options
   * @param args Query options including where, orderBy, skip, take, select
   * @returns Array of matching records
   */
  findMany(args?: FindManyOptions<T>): Promise<T[]>;
  /**
   * Count records matching the conditions
   * @param args.where Optional where conditions
   * @returns Count of matching records
   */
  count(args?: {
    where?: FindManyOptions<T>["where"];
  }): Promise<number>;
  /**
   * Update a single record by _id
   * @param args.where Where clause with _id
   * @param args.data Data to update
   * @returns Updated record
   */
  update(args: {
    where: {
      _id: string;
    };
    data: Partial<T>;
  }): Promise<T | null>;
  /**
   * Update multiple records matching the conditions
   * @param args.where Where conditions
   * @param args.data Data to update
   * @returns Count of updated records
   */
  updateMany(args: {
    where: FindManyOptions<T>["where"];
    data: Partial<T>;
  }): Promise<{
    count: number;
  }>;
  /**
   * Delete a single record by _id
   * @param args.where Where clause with _id
   * @returns Deleted record or null if not found
   */
  delete(args: {
    where: {
      _id: string;
    };
  }): Promise<T | null>;
  /**
   * Delete multiple records matching the conditions
   * @param args.where Where conditions
   * @returns Count of deleted records
   */
  deleteMany(args: {
    where: FindManyOptions<T>["where"];
  }): Promise<{
    count: number;
  }>;
  private getCreateData;
  private getUpdateData;
  private buildWhereFromOptions;
}
//#endregion
//#region types/ITreeNode.d.ts
declare enum TreeNodeType {
  Table = "table",
  Doc = "doc",
  Folder = "folder",
  Dataview = "dataview",
}
interface ITreeNode {
  id: string;
  name: string;
  type: TreeNodeType | `ext__${string}` | "day" | "table" | "doc" | "folder" | "dataview" | "extension";
  position?: number;
  parent_id?: string;
  is_pinned?: boolean;
  is_full_width?: boolean;
  is_locked?: boolean;
  is_deleted?: boolean;
  hide_properties?: boolean;
  icon?: string;
  cover?: string;
  created_at?: string;
  updated_at?: string;
}
//# sourceMappingURL=ITreeNode.d.ts.map
//#endregion
//#region sdk/node.d.ts
interface NodeApiOptions {
  content?: string;
  schema?: TableSchema;
  query?: string;
  hideProperties?: boolean;
}
interface TableSchema {
  columns: Array<{
    name: string;
    type: string;
    options?: any;
  }>;
}
interface DeleteOptions {
  permanent?: boolean;
  recursive?: boolean;
}
interface FindQuery {
  name?: string;
  type?: string | string[];
  parent?: string;
  isDeleted?: boolean;
}
/**
 * Node SDK client - provides path-based node operations
 *
 * @example
 * ```typescript
 * // Get node by path
 * const node = await space.node.get("projects/roadmap")
 *
 * // Create a document
 * await space.node.create("notes/idea", "doc", {
 *   content: "# My Idea\n\nThis is brilliant!"
 * })
 *
 * // Move node
 * await space.node.move("drafts/article", "published/article")
 *
 * // Delete node
 * await space.node.delete("old-document")
 * ```
 */
declare class NodeClient {
  private dataSpace;
  constructor(dataSpace: DataSpace);
  /**
   * Check if path-based operations are available
   * Requires node name uniqueness to be enabled
   */
  isPathEnabled(): Promise<boolean>;
  /**
   * Ensure path-based operations are enabled
   * @throws Error if path resolution is disabled
   */
  private ensurePathEnabled;
  /**
   * Parse a path into parent path and name
   * Paths are relative to space root, no "/" prefix
   * @example "folder/doc" -> { parentPath: "folder", name: "doc" }
   * @example "doc" -> { parentPath: "", name: "doc" }
   */
  private parsePath;
  /**
   * Resolve a path to a node ID
   * Returns null if path doesn't exist or uniqueness is not enabled
   * Paths are relative to space root, no "/" prefix needed
   */
  resolvePath(path: string): Promise<{
    id: string;
    node: ITreeNode;
  } | null>;
  /**
   * Get a node by its path
   * Requires name uniqueness to be enabled
   */
  get(path: string): Promise<ITreeNode | null>;
  /**
   * Get a node by its ID
   * Works regardless of name uniqueness setting
   */
  getById(id: string): Promise<ITreeNode | null>;
  /**
   * List child nodes at a path
   * Use empty string "" for root
   */
  list(path?: string): Promise<ITreeNode[]>;
  /**
   * Create a new node at the specified path
   */
  create(path: string, type: "doc" | "table" | "folder" | "dataview" | string, options?: NodeApiOptions): Promise<ITreeNode>;
  /**
   * Move or rename a node
   */
  move(sourcePath: string, destPath: string): Promise<ITreeNode>;
  /**
   * Delete a node
   */
  delete(path: string, options?: DeleteOptions): Promise<void>;
  /**
   * Check if a node exists at the given path
   */
  exists(path: string): Promise<boolean>;
  /**
   * Duplicate a node
   */
  duplicate(path: string, newPath?: string): Promise<ITreeNode>;
  /**
   * Search for nodes
   */
  find(query?: FindQuery): Promise<ITreeNode[]>;
  /**
   * Get the text content of an extension node
   */
  getText(id: string): Promise<string | null>;
  /**
   * Set the text content of an extension node
   */
  setText(id: string, text: string): Promise<boolean>;
  /**
   * Get the binary data of an extension node
   */
  getBlob(id: string): Promise<Buffer | null>;
  /**
   * Set the binary data of an extension node
   */
  setBlob(id: string, blob: Buffer): Promise<boolean>;
  /**
   * Restore a deleted node
   */
  restore(path: string): Promise<void>;
}
//# sourceMappingURL=node.d.ts.map
//#endregion
//#region meta-table/base.d.ts
interface MetaTable<T> {
  add(data: T): Promise<T>;
  get(id: string): Promise<T | null>;
  set(id: string, data: Partial<T>): Promise<boolean>;
  del(id: string): Promise<boolean>;
}
interface BaseTable<T> extends MetaTable<T> {
  name: string;
  createTableSql: string;
  JSONFields?: string[];
}
declare class BaseTableImpl<T = any> {
  name: string;
  JSONFields: string[];
  dataSpace: DataSpace;
  constructor(dataSpace: DataSpace);
  initTable(createTableSql: string): void;
  toJson: (data: T) => T;
  /**
   * Check if column exists
   * @param columnName column name
   * @returns whether it exists
   */
  columnExists(columnName: string): Promise<boolean>;
  /**
   * Get table column information
   * @returns array of column information
   */
  getTableColumns(): Promise<string[]>;
  getRegularTriggers(tableName: string): Promise<{
    name: string;
  }[]>;
  getTempTriggers(tableName: string): Promise<{
    name: string;
  }[]>;
  del(id: string, db?: BaseServerDatabase): Promise<boolean>;
  delBy(data: Partial<T>, db?: BaseServerDatabase): Promise<boolean>;
  get(id: string): Promise<T | null | any>;
  transformData: (data: Partial<T>) => {
    kv: any[][];
    updateKPlaceholder: string;
    insertKPlaceholder: string;
    insertVPlaceholder: string;
    deleteKPlaceholder: string;
    values: any[];
  };
  add(data: Partial<T>, db?: BaseServerDatabase): Promise<T>;
  set(id: string, data: Partial<T>): Promise<boolean>;
  list(query?: Partial<T>, opts?: {
    limit?: number;
    offset?: number;
    orderBy?: string;
    order?: "ASC" | "DESC";
    fields?: string[];
  }): Promise<T[]>;
  findMany(options?: FindManyOptions<T>): Promise<T[]>;
  count(options?: Omit<FindManyOptions<T>, "select" | "orderBy" | "skip" | "take">): Promise<number>;
}
//# sourceMappingURL=base.d.ts.map
//#endregion
//#region meta-table/file/base.d.ts
interface IFile {
  id: string;
  name: string;
  path: string;
  size: number;
  mime: string;
  created_at?: string;
  updated_at?: string;
  is_vectorized?: boolean;
}
declare class BaseFileTable extends BaseTableImpl<IFile> implements BaseTable<IFile> {
  name: string;
  createTableSql: string;
  add(data: IFile): Promise<IFile>;
  getFileByPath(path: string): Promise<IFile | null>;
}
//# sourceMappingURL=base.d.ts.map
//#endregion
//#region meta-table/file/index.d.ts
declare const ComposedFileTable: {
  new (...args: any[]): {
    migrateFilePaths(): Promise<{
      migrated: number;
      errors: number;
    }>;
    needsPathMigration(): Promise<boolean>;
    name: string;
    createTableSql: string;
    add(data: IFile): Promise<IFile>;
    getFileByPath(path: string): Promise<IFile | null>;
    JSONFields: string[];
    dataSpace: DataSpace;
    initTable(createTableSql: string): void;
    toJson: (data: T) => T;
    columnExists(columnName: string): Promise<boolean>;
    getTableColumns(): Promise<string[]>;
    getRegularTriggers(tableName: string): Promise<{
      name: string;
    }[]>;
    getTempTriggers(tableName: string): Promise<{
      name: string;
    }[]>;
    del(id: string, db?: BaseServerDatabase): Promise<boolean>;
    delBy(data: Partial<IFile>, db?: BaseServerDatabase): Promise<boolean>;
    get(id: string): Promise<IFile | null | any>;
    transformData: (data: Partial<T>) => {
      kv: any[][];
      updateKPlaceholder: string;
      insertKPlaceholder: string;
      insertVPlaceholder: string;
      deleteKPlaceholder: string;
      values: any[];
    };
    set(id: string, data: Partial<IFile>): Promise<boolean>;
    list(query?: Partial<IFile> | undefined, opts?: {
      limit?: number;
      offset?: number;
      orderBy?: string;
      order?: "ASC" | "DESC";
      fields?: string[];
    }): Promise<IFile[]>;
    findMany(options?: FindManyOptions<IFile>): Promise<IFile[]>;
    count(options?: Omit<FindManyOptions<IFile>, "select" | "orderBy" | "skip" | "take">): Promise<number>;
  };
} & typeof BaseFileTable;
declare class FileTable extends ComposedFileTable {}
//#endregion
//#region data-pipeline/DataChangeEventHandler.d.ts
declare class DataChangeEventHandler {
  private dataSpace;
  constructor(dataSpace: DataSpace);
  handleLinkRelationChange: (data: {
    table: string;
    _old: Record<string, any>;
    _new: Record<string, any>;
  }) => Promise<void>;
  static getDiff: (oldData: Record<string, any> | undefined, newData: Record<string, any>) => Record<string, {
    old: any;
    new: any;
  }>;
}
//# sourceMappingURL=DataChangeEventHandler.d.ts.map
//#endregion
//#region data-pipeline/DataChangeTrigger.d.ts
type IRegisterTrigger = {
  update: string;
  insert: string;
  delete: string;
};
declare class DataChangeTrigger {
  triggerMap: Map<string, IRegisterTrigger>;
  constructor();
  private getRowJSONObj;
  registerTrigger(space: string, tableName: string, trigger: IRegisterTrigger): Promise<void>;
  unRegisterTrigger(space: string, tableName: string): Promise<void>;
  /**
   * Drop data change triggers for a table.
   * Does not recreate them - use setTrigger to recreate.
   */
  dropTriggers(dataspace: DataSpace, tableName: string): Promise<void>;
  isTriggerChanged(space: string, tableName: string, trigger: IRegisterTrigger): boolean;
  setTrigger(dataspace: DataSpace, tableName: string, collist: any[], toDeleteColumns?: string[]): Promise<void>;
}
//#endregion
//#region data-pipeline/LinkRelationUpdater.d.ts
declare class LinkRelationUpdater {
  private dataSpace;
  needUpdateCell: Record<string, Record<string, Set<string>>>;
  constructor(dataSpace: DataSpace, setInterval?: typeof global.setInterval);
  updateCells: () => Promise<void>;
  addCell: (tableName: string, tableColumnName: string, rowId: string) => void;
}
//# sourceMappingURL=LinkRelationUpdater.d.ts.map
//#endregion
//#region data-pipeline/TableFullTextSearch.d.ts
declare class TableFullTextSearch {
  private dataspace;
  private enableFTS;
  constructor(dataspace: DataSpace, enableFTS?: boolean);
  createDynamicFTS(tableName: string, temporary?: boolean, inTransaction?: boolean): Promise<void>;
  private createTriggers;
  search(tableName: string, query: string, viewId: string, page?: number, pageSize?: number): Promise<{
    results: {
      row: any;
      matches: {
        column: any;
        snippet: any;
      }[];
      rowIndex: any;
    }[];
    searchTime: number;
    totalMatches: any;
    currentPage: number;
    totalPages: number;
  }>;
  updateTrigger(tableName: string, toDeleteColumns: string[]): Promise<void>;
  clearFTS(tableName: string): Promise<void>;
  /**
   * Drop only FTS triggers without dropping the FTS table.
   * Useful when modifying table schema (e.g., dropping columns).
   */
  dropFTSTriggers(tableName: string): Promise<void>;
  dropFTS(tableName: string): Promise<void>;
  hasFTS(tableName: string): Promise<boolean>;
  /**
   * Check if FTS table needs rebuild (e.g., when new columns are added)
   * Compares the columns in the original table with the FTS table
   */
  needsRebuild(tableName: string): Promise<boolean>;
  /**
   * Get row count of a table (approximate, uses sqlite table stats if available)
   */
  private getTableRowCount;
  /**
   * Check if auto-rebuild should be skipped for large tables.
   * Returns true if table is small enough for auto-rebuild.
   */
  shouldAutoRebuild(tableName: string): Promise<boolean>;
  /**
   * Smart FTS schema sync with threshold-based decision.
   * - Small tables (< threshold): auto rebuild
   * - Large tables (>= threshold): notify user to manually rebuild
   * Returns object with rebuild status and message.
   */
  smartEnsureFTSSchema(tableName: string): Promise<{
    rebuilt: boolean;
    skipped: boolean;
    message?: string;
    rowCount?: number;
  }>;
  /**
   * Ensure FTS table schema is in sync with the original table.
   * Only rebuilds if necessary (when columns have changed).
   * Returns true if rebuild was performed.
   * @deprecated Use smartEnsureFTSSchema for better UX with large tables
   */
  ensureFTSSchema(tableName: string): Promise<boolean>;
  rebuildFTS(tableName: string): Promise<void>;
}
//# sourceMappingURL=TableFullTextSearch.d.ts.map
//#endregion
//#region data-pipeline/TableSemanticSearch.d.ts
declare class TableSemanticSearch {
  private readonly dataspace;
  constructor(dataspace: DataSpace);
  search(params: {
    tableName: string;
    query: string;
    viewId?: string;
    fieldId?: string;
    page?: number;
    pageSize?: number;
    method?: "L2" | "COSINE";
  }): Promise<{
    meta: {
      embeddingFieldId: string;
      page: number;
      pageSize: number;
    };
    results: any;
  }>;
}
//# sourceMappingURL=TableSemanticSearch.d.ts.map
//#endregion
//#region data-pipeline/UndoRedo.d.ts
interface StackEntry {
  begin: number;
  end: number;
}
interface UndoRedoState {
  active: boolean;
  undostack: StackEntry[];
  redostack: StackEntry[];
  pending?: any;
  firstlog: number;
  freeze?: number;
  startstate?: unknown;
}
declare class SQLiteUndoRedo {
  undo: UndoRedoState;
  db: DataSpace;
  triggerNames: string[];
  constructor(db: DataSpace);
  activate(tables: string[]): void;
  deactivate(): void;
  freeze(): Promise<void>;
  unfreeze(): void;
  event(): void;
  barrier(): Promise<void>;
  callUndo(): void;
  callRedo(): void;
  refresh(): void;
  reload_all(): void;
  private _makeTriggersForTbl;
  private createTriggers;
  private _drop_triggers;
  private _start_interval;
  private _step;
}
//#endregion
//#region meta-table/message.d.ts
type ChatMessage = {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  parts: Message["parts"];
  created_at?: string;
};
declare class MessageTable extends BaseTableImpl<ChatMessage> implements BaseTable<ChatMessage> {
  name: string;
  createTableSql: string;
  JSONFields: string[];
  deleteMessagesByChatId(chatId: string): Promise<void>;
  deleteByIds(messageIds: string[]): Promise<void>;
  clearMessages(chatId: string): Promise<void>;
}
//# sourceMappingURL=message.d.ts.map
//#endregion
//#region meta-table/chat.d.ts
type Chat = {
  id: string;
  created_at: string;
  title: string;
  user_id: string;
  project_id: string;
};
declare class ChatTable extends BaseTableImpl<Chat> implements BaseTable<Chat> {
  name: string;
  createTableSql: string;
  getChatIdsByProjectId(projectId: string): Promise<string[]>;
  getChatsByProjectId(projectId: string): Promise<Chat[]>;
  getChatById(chatId: string): Promise<(Chat & {
    messages: ChatMessage[];
  }) | null>;
  del(chatId: string): Promise<boolean>;
}
//# sourceMappingURL=chat.d.ts.map
//#endregion
//#region meta-table/column.d.ts
/**
 * define
 * 1. column: a real column in table
 * 2. field: a wrapper of column, with some additional properties which control the UI behavior
 *
 * this table is used to manage the mapping between column and field
 */
declare class ColumnTable extends BaseTableImpl implements BaseTable<IField> {
  name: string;
  createTableSql: string;
  JSONFields: string[];
  static getColumnTypeByFieldType(type: FieldType | `${FieldType}`): any;
  addPureUIColumn(data: IField): Promise<void>;
  updatePureUIColumn(data: Partial<IField>): Promise<void>;
  add(data: IField): Promise<IField>;
  addField(data: IField): Promise<IField>;
  getColumn<T = any>(tableName: string, tableColumnName: string): Promise<IField<T> | null>;
  set(id: string, data: Partial<IField>): Promise<boolean>;
  del(id: string): Promise<boolean>;
  deleteField(tableName: string, tableColumnName: string): Promise<string[]>;
  /**
   * @param tableName tb_<uuid>
   */
  deleteByRawTableName(tableName: string, db?: BaseServerDatabase): Promise<void>;
  /**
   * Update formula column and handle dependencies
   * @param tableName Table name
   * @param tableColumnName Column name
   * @param property New property
   * @param fields All fields
   * @param db Database connection
   */
  private updateFormulaColumn;
  updateProperty(data: {
    tableName: string;
    tableColumnName: string;
    property: any;
    type: FieldType | `${FieldType}`;
  }): Promise<void>;
  list(q: {
    table_name: string;
  }): Promise<IField[]>;
  static isColumnTypeChanged(oldType: FieldType, newType: FieldType): boolean;
  changeType(tableName: string, tableColumnName: string, newType: FieldType): Promise<void>;
}
//# sourceMappingURL=column.d.ts.map
//#endregion
//#region meta-table/doc/base.d.ts
interface IDoc {
  id: string;
  content: string;
  markdown: string;
  is_day_page?: boolean;
  created_at?: string;
  updated_at?: string;
  meta?: string;
  [key: string]: any;
}
interface DocMeta {
  displayProperties?: string[];
  [key: string]: any;
}
declare class BaseDocTable extends BaseTableImpl<IDoc> implements BaseTable<IDoc> {
  name: string;
  createTableSql: string;
}
//# sourceMappingURL=base.d.ts.map
//#endregion
//#region meta-table/doc/index.d.ts
declare const ComposedDocTable: {
  new (...args: any[]): {
    callMain: (type: MsgType.GetDocMarkdown | MsgType.ConvertMarkdown2State | MsgType.ConvertHtml2State | MsgType.ConvertEmail2State, data: any) => Promise<any> | undefined;
    listAllDayPages(): Promise<any>;
    listDayPage(page?: number): Promise<any>;
    getMarkdownBatch(ids: string[]): Promise<{
      id: string;
      markdown: string;
    }[]>;
    searchDayPages(term: string, page?: number, pageSize?: number): Promise<{
      id: string;
      markdown: string;
    }[]>;
    getMarkdown(id: string): Promise<string>;
    getBaseInfo(id: string): Promise<Partial<IDoc>>;
    createOrUpdateWithMarkdown(id: string, mdStr: string): Promise<{
      id: string;
      success: boolean;
      msg?: undefined;
    } | {
      id: string;
      success: boolean;
      msg: string;
    }>;
    createOrUpdate(data: {
      id: string;
      text: string | postal_mime9.Email;
      type: "html" | "markdown" | "email";
      mode?: "replace" | "append" | "prepend";
    }): Promise<{
      id: string;
      success: boolean;
      msg?: undefined;
    } | {
      id: string;
      success: boolean;
      msg: string;
    }>;
    _createOrUpdate(id: string, content: string, markdown: string, mode?: "replace" | "append" | "prepend"): Promise<{
      id: string;
      success: boolean;
      msg?: undefined;
    } | {
      id: string;
      success: boolean;
      msg: string;
    }>;
    name: string;
    createTableSql: string;
    JSONFields: string[];
    dataSpace: DataSpace;
    initTable(createTableSql: string): void;
    toJson: (data: T) => T;
    columnExists(columnName: string): Promise<boolean>;
    getTableColumns(): Promise<string[]>;
    getRegularTriggers(tableName: string): Promise<{
      name: string;
    }[]>;
    getTempTriggers(tableName: string): Promise<{
      name: string;
    }[]>;
    del(id: string, db?: BaseServerDatabase): Promise<boolean>;
    delBy(data: Partial<IDoc>, db?: BaseServerDatabase): Promise<boolean>;
    get(id: string): Promise<IDoc | null | any>;
    transformData: (data: Partial<T>) => {
      kv: any[][];
      updateKPlaceholder: string;
      insertKPlaceholder: string;
      insertVPlaceholder: string;
      deleteKPlaceholder: string;
      values: any[];
    };
    add(data: Partial<IDoc>, db?: BaseServerDatabase): Promise<IDoc>;
    set(id: string, data: Partial<IDoc>): Promise<boolean>;
    list(query?: Partial<IDoc> | undefined, opts?: {
      limit?: number;
      offset?: number;
      orderBy?: string;
      order?: "ASC" | "DESC";
      fields?: string[];
    }): Promise<IDoc[]>;
    findMany(options?: FindManyOptions<IDoc>): Promise<IDoc[]>;
    count(options?: Omit<FindManyOptions<IDoc>, "select" | "orderBy" | "skip" | "take">): Promise<number>;
  };
  mergeState: (oldState: string, newState: string) => string;
} & {
  new (...args: any[]): {
    rebuildIndex(opts: {
      refillNullMarkdown?: boolean;
    }): Promise<void>;
    search(query: string, options?: {
      allowAdvanced?: boolean;
      onlyDayPages?: boolean;
    } | undefined): Promise<{
      id: string;
      result: string;
    }[]>;
    name: string;
    createTableSql: string;
    JSONFields: string[];
    dataSpace: DataSpace;
    initTable(createTableSql: string): void;
    toJson: (data: T) => T;
    columnExists(columnName: string): Promise<boolean>;
    getTableColumns(): Promise<string[]>;
    getRegularTriggers(tableName: string): Promise<{
      name: string;
    }[]>;
    getTempTriggers(tableName: string): Promise<{
      name: string;
    }[]>;
    del(id: string, db?: BaseServerDatabase): Promise<boolean>;
    delBy(data: Partial<IDoc>, db?: BaseServerDatabase): Promise<boolean>;
    get(id: string): Promise<IDoc | null | any>;
    transformData: (data: Partial<T>) => {
      kv: any[][];
      updateKPlaceholder: string;
      insertKPlaceholder: string;
      insertVPlaceholder: string;
      deleteKPlaceholder: string;
      values: any[];
    };
    add(data: Partial<IDoc>, db?: BaseServerDatabase): Promise<IDoc>;
    set(id: string, data: Partial<IDoc>): Promise<boolean>;
    list(query?: Partial<IDoc> | undefined, opts?: {
      limit?: number;
      offset?: number;
      orderBy?: string;
      order?: "ASC" | "DESC";
      fields?: string[];
    }): Promise<IDoc[]>;
    findMany(options?: FindManyOptions<IDoc>): Promise<IDoc[]>;
    count(options?: Omit<FindManyOptions<IDoc>, "select" | "orderBy" | "skip" | "take">): Promise<number>;
  };
} & {
  new (...args: any[]): {
    ensureCustomPropertyColumns(properties: Record<string, any>): Promise<void>;
    getCustomProperties(id: string): Promise<any>;
    getProperties(id: string): Promise<any>;
    setProperties(id: string, properties: Record<string, any>): Promise<{
      success: boolean;
      message: string;
      updatedProperties?: undefined;
    } | {
      success: boolean;
      updatedProperties: string[];
      message?: undefined;
    }>;
    deleteTrigger(): Promise<void>;
    registerTrigger(): Promise<void>;
    flushTrigger(): Promise<void>;
    getMeta(id: string): Promise<DocMeta>;
    setMeta(id: string, meta: DocMeta): Promise<{
      success: boolean;
      message?: string;
    }>;
    addDisplayProperty(id: string, propertyName: string): Promise<{
      success: boolean;
      message?: string;
    }>;
    removeDisplayProperty(id: string, propertyName: string): Promise<{
      success: boolean;
      message?: string;
    }>;
    setDisplayProperties(id: string, propertyNames: string[]): Promise<{
      success: boolean;
      message?: string;
    }>;
    getDisplayProperties(id: string): Promise<Record<string, any>>;
    getPropertyTypes(): Promise<{
      name: any;
      type: any;
    }[]>;
    changePropertyType(propertyName: string, newType: FieldType): Promise<void>;
    getPropertyNonEmptyCount(propertyName: string): Promise<number>;
    deleteProperty(propertyName: string): Promise<void>;
    name: string;
    createTableSql: string;
    JSONFields: string[];
    dataSpace: DataSpace;
    initTable(createTableSql: string): void;
    toJson: (data: T) => T;
    columnExists(columnName: string): Promise<boolean>;
    getTableColumns(): Promise<string[]>;
    getRegularTriggers(tableName: string): Promise<{
      name: string;
    }[]>;
    getTempTriggers(tableName: string): Promise<{
      name: string;
    }[]>;
    del(id: string, db?: BaseServerDatabase): Promise<boolean>;
    delBy(data: Partial<IDoc>, db?: BaseServerDatabase): Promise<boolean>;
    get(id: string): Promise<IDoc | null | any>;
    transformData: (data: Partial<T>) => {
      kv: any[][];
      updateKPlaceholder: string;
      insertKPlaceholder: string;
      insertVPlaceholder: string;
      deleteKPlaceholder: string;
      values: any[];
    };
    add(data: Partial<IDoc>, db?: BaseServerDatabase): Promise<IDoc>;
    set(id: string, data: Partial<IDoc>): Promise<boolean>;
    list(query?: Partial<IDoc> | undefined, opts?: {
      limit?: number;
      offset?: number;
      orderBy?: string;
      order?: "ASC" | "DESC";
      fields?: string[];
    }): Promise<IDoc[]>;
    findMany(options?: FindManyOptions<IDoc>): Promise<IDoc[]>;
    count(options?: Omit<FindManyOptions<IDoc>, "select" | "orderBy" | "skip" | "take">): Promise<number>;
  };
} & typeof BaseDocTable;
declare class DocTable extends ComposedDocTable {
  /**
   * Duplicate a doc
   * @param id doc id
   * @returns
   */
  duplicate(id: string): Promise<ITreeNode | null>;
  /**
   * Read document content by path
   * Requires name uniqueness to be enabled
   */
  read(path: string): Promise<string>;
  /**
   * Write document content by path (overwrites existing content)
   * Requires name uniqueness to be enabled
   */
  write(path: string, markdown: string): Promise<void>;
  /**
   * Append content to document by path
   * Requires name uniqueness to be enabled
   */
  append(path: string, markdown: string): Promise<void>;
  /**
   * Prepend content to document by path
   * Requires name uniqueness to be enabled
   */
  prepend(path: string, markdown: string): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map
//#endregion
//#region meta-table/embedding.d.ts
interface IEmbedding {
  id: string;
  embedding: string;
  model: string;
  raw_content: string;
  source_type: "doc" | "table" | "file";
  source: string;
}
declare class EmbeddingTable extends BaseTableImpl implements BaseTable<IEmbedding> {
  name: string;
  createTableSql: string;
  add(data: IEmbedding): Promise<IEmbedding>;
  get(id: string): Promise<IEmbedding | null>;
  set(id: string, data: Partial<IEmbedding>): Promise<boolean>;
  del(id: string): Promise<boolean>;
}
//# sourceMappingURL=embedding.d.ts.map
//#endregion
//#region types/IExtension.d.ts
type ExtensionStatus = "all" | "enabled" | "disabled";
type BindingType = "table" | "secret" | "text";
type ExtensionMeta = TableViewMeta | ExtNodeMeta | FileHandlerMeta | FolderHandlerMeta | ToolMeta | TableActionMeta | DocActionMeta | FileActionMeta | UDFMeta | RelayHandlerMeta;
type IBinding = {
  type: BindingType;
  value: string;
};
type IBindings = Record<string, IBinding>;
interface IExtension<T extends ExtensionMeta = ExtensionMeta> {
  id: string;
  slug: string;
  name: string;
  type: "script" | "block";
  description: string;
  version: string;
  code: string;
  meta?: T;
  icon?: string;
  marketplace_id?: string;
  ts_code?: string;
  enabled?: boolean;
  bindings?: IBindings;
  created_at?: string;
  updated_at?: string;
}
declare enum ScriptExtensionType {
  TableAction = "tableAction",
  DocAction = "docAction",
  FileAction = "fileAction",
  Tool = "tool",
  UDF = "udf",
  RelayHandler = "relayHandler",
}
declare enum BlockExtensionType {
  TableView = "tableView",
  ExtNode = "extNode",
  FileHandler = "fileHandler",
  FolderHandler = "folderHandler",
}
interface TableViewMeta {
  type: BlockExtensionType.TableView;
  componentName: string;
  tableView: {
    title: string;
    type: string;
    description: string;
    tableId?: string;
  };
}
interface ExtNodeMeta {
  type: BlockExtensionType.ExtNode;
  componentName: string;
  extNode: {
    title: string;
    description: string;
    type: string;
  };
}
interface FileHandlerMeta {
  type: BlockExtensionType.FileHandler;
  componentName: string;
  fileHandler: {
    title: string;
    description: string;
    extensions: string[];
    icon?: string;
  };
}
interface FolderHandlerMeta {
  type: BlockExtensionType.FolderHandler;
  componentName: string;
  folderHandler: {
    title: string;
    description: string;
    patterns: string[];
    folderNames?: string[];
    icon?: string;
    allowRoot?: boolean;
    priority?: number;
  };
}
interface ToolMeta {
  type: ScriptExtensionType.Tool;
  funcName: string;
  tool: {
    name: string;
    description: string;
    inputJSONSchema: JsonSchema7ObjectType;
    outputJSONSchema: JsonSchema7ObjectType;
  };
}
interface TableActionMeta {
  type: ScriptExtensionType.TableAction;
  funcName: string;
  tableAction: {
    name: string;
    description: string;
  };
}
interface DocActionMeta {
  type: ScriptExtensionType.DocAction;
  funcName: string;
  docAction: {
    name: string;
    description: string;
  };
}
interface FileActionMeta {
  type: ScriptExtensionType.FileAction;
  funcName: string;
  fileAction: {
    name: string;
    description: string;
    extensions: string[];
    icon?: string;
  };
}
interface UDFMeta {
  type: ScriptExtensionType.UDF;
  funcName: string;
  udf: {
    name: string;
    deterministic?: boolean;
  };
}
interface RelayHandlerMeta {
  type: ScriptExtensionType.RelayHandler;
  funcName: string;
  relayHandler: {
    name: string;
    description: string;
  };
}
//#endregion
//#region meta-table/extension.d.ts
/**
 * Extension statistics interface
 */
interface ExtensionStats {
  scripts: {
    total: number;
    tool: number;
    tableAction: number;
    udf: number;
    others: number;
  };
  blocks: {
    total: number;
    tableView: number;
    extNode: number;
    others: number;
  };
  total: number;
}
declare class ExtensionTable extends BaseTableImpl<IExtension> implements BaseTable<IExtension> {
  name: string;
  createTableSql: string;
  JSONFields: string[];
  static isUDFExtension(extension: IExtension): boolean;
  getTableViews(): Promise<IExtension<TableViewMeta>[]>;
  getTableViewExtensionInfoByExtType(viewType: string): Promise<IExtension<TableViewMeta>[]>;
  getTableViewsInfo(): Promise<IExtension<TableViewMeta>[]>;
  del(id: string): Promise<boolean>;
  /**
   * Batch get extensions by IDs
   * @param ids Array of extension IDs
   * @returns Record mapping ID to extension data (or null if not found)
   */
  getBatch(ids: string[]): Promise<Record<string, IExtension | null>>;
  enable(id: string): Promise<boolean>;
  disable(id: string): Promise<boolean>;
  /**
   * Build the virtual path for an extension (~/ .eidos/__EXTENSIONS__/slug.ts)
   * Returns null if the extension does not exist.
   * For hierarchical slugs like "ejected/journals/index", returns "~/.eidos/__EXTENSIONS__/ejected/journals/index.ts"
   */
  getIdPath(extensionId: string): Promise<string | null>;
  updateBindings(id: string, bindings: IBindings): Promise<boolean>;
  /**
   * Get all block extensions by status
   */
  getBlockExtensions(status?: ExtensionStatus): Promise<IExtension[]>;
  /**
   * Get ExtNode extensions by status
   */
  getExtNodeExtensions(status?: ExtensionStatus): Promise<IExtension[]>;
  /**
   * Get ExtNode extensions by handler type
   */
  getExtNodeExtensionsByHandlerType(type: string, status?: ExtensionStatus): Promise<IExtension[]>;
  /**
   * Get all script extensions by status
   */
  getScriptExtensions(status?: ExtensionStatus): Promise<IExtension[]>;
  /**
   * Get Tool extensions by status
   */
  getToolExtensions(status?: ExtensionStatus): Promise<IExtension[]>;
  /**
   * Get TableAction extensions by status
   */
  getTableActionExtensions(status?: ExtensionStatus): Promise<IExtension<TableActionMeta>[]>;
  /**
   * Get DocAction extensions by status
   */
  getDocActionExtensions(status?: ExtensionStatus): Promise<IExtension<DocActionMeta>[]>;
  /**
   * Get UDF (User Defined Function) extensions by status
   */
  getUDFExtensions(status?: ExtensionStatus): Promise<IExtension<UDFMeta>[]>;
  /**
   * Generic method to get script extensions by type and status
   */
  private getScriptExtensionsByType;
  /**
   * Get extension by slug
   */
  getExtensionBySlug(slug: string): Promise<IExtension | null>;
  getExtensionBySlugOrId(idOrSlug: string): Promise<IExtension | null>;
  /**
   * Check if a slug already exists
   */
  slugExists(slug: string): Promise<boolean>;
  /**
   * Generate a unique slug based on a base slug
   * If the base slug already exists, it will append a number to make it unique
   */
  generateUniqueSlug(baseSlug: string): Promise<string>;
  /**
   * Get extensions by marketplace ID
   */
  getExtensionsByMarketplaceId(marketplaceId: string): Promise<IExtension[]>;
  /**
   * Get extensions by type and status
   */
  getExtensionsByType(type: "script" | "block", status?: ExtensionStatus): Promise<IExtension[]>;
  /**
   * Search extensions by name or description
   */
  searchExtensions(query: string, status?: ExtensionStatus): Promise<IExtension[]>;
  /**
   * Full-text search extensions by code using trigram + LIKE
   */
  fullTextSearchExtensions(query: string): Promise<Array<IExtension & {
    result?: string;
  }>>;
  /**
   * Get extensions with bindings
   */
  getExtensionsWithBindings(status?: ExtensionStatus): Promise<IExtension[]>;
  /**
   * Get extension count by type and status
   */
  getExtensionCount(type?: "script" | "block", status?: ExtensionStatus): Promise<number>;
  /**
   * Get comprehensive extension statistics
   */
  getExtensionStats(status?: ExtensionStatus): Promise<ExtensionStats>;
  /**
   * Get count for a specific extension meta type
   */
  getExtensionCountByMetaType(extensionType: "script" | "block", metaType: string, status?: ExtensionStatus): Promise<number>;
  /**
   * Get extensions by meta type (including "others" for empty extensions)
   */
  getExtensionsByMetaType(extensionType: "script" | "block", metaType: string, status?: ExtensionStatus): Promise<IExtension[]>;
  /**
   * Override add method to ensure slug uniqueness and tableView type uniqueness
   */
  add(data: Partial<IExtension>, db?: BaseServerDatabase): Promise<IExtension>;
  /**
   * Fix duplicate slugs in existing extensions
   * This method should be called during migration to ensure all existing extensions have unique slugs
   */
  fixDuplicateSlugs(): Promise<void>;
  /**
   * Install extension from raw TypeScript/TSX code.
   * Requires compileExtension to be injected via context.
   *
   * For tableView extensions with a bound tableId, this method also creates
   * a view instance in the eidos__view table so the view appears in the table.
   *
   * @param code - Raw TypeScript/TSX code
   * @param filename - Original filename (e.g., "my-ext.tsx" or "my-script.ts")
   *                   Used to determine parsing mode based on file extension
   * @param slug - Optional slug for updating existing extension
   * @returns The installed extension
   */
  installFromCode(code: string, filename: string, slug?: string): Promise<IExtension>;
}
//# sourceMappingURL=extension.d.ts.map
//#endregion
//#region meta-table/extnode.d.ts
interface IExtNode {
  id: string;
  blob?: Buffer;
  text?: string;
  type: string;
  created_at?: string;
  updated_at?: string;
}
declare class ExtNodeTable extends BaseTableImpl<IExtNode> implements BaseTable<IExtNode> {
  name: string;
  createTableSql: string;
  getBlob(id: string): Promise<Buffer | null>;
  getText(id: string): Promise<string | null>;
  setBlob(id: string, blob: Buffer): Promise<boolean>;
  setText(id: string, text: string): Promise<boolean>;
}
//# sourceMappingURL=extnode.d.ts.map
//#endregion
//#region meta-table/kv.d.ts
type KV = {
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
  meta: Record<string, any>;
};
type KVGetType = "text" | "integer" | "real" | "json";
declare class KVTable extends BaseTableImpl<KV> implements BaseTable<KV> {
  name: string;
  createTableSql: string;
  JSONFields: string[];
  /**
   * Get a single value from the KV store (Cloudflare Workers KV compatible)
   * @param key The key of the KV pair
   * @param typeOrOptions Optional type or options object
   * @returns Promise resolving to the value or null if not found
   */
  get(key: string, typeOrOptions?: KVGetType): Promise<any | null>;
  /**
   * Put a value into the KV store
   * @param key The key of the KV pair
   * @param value The value of the KV pair
   * @param options The options for the KV pair
   */
  put(key: string, value: any, options?: {
    meta: Record<string, any>;
  }): Promise<void>;
  /**
   * List values from the KV store with optional prefix filter
   * @param options Options for listing
   * @returns Promise resolving to array of KV records
   */
  listWithPrefix(options?: {
    prefix?: string;
  }): Promise<KV[]>;
  /**
   * Delete a value from the KV store
   * @param key
   * @returns A Promise that resolves if the delete is successful.
   */
  delete(key: string): Promise<void>;
}
//# sourceMappingURL=kv.d.ts.map
//#endregion
//#region meta-table/reference.d.ts
interface IReference {
  self: string;
  ref: string;
  link: string;
  self_table_name: string;
  self_table_column_name: string;
  ref_table_name: string;
  ref_table_column_name: string;
  link_table_name: string;
  link_table_column_name: string;
}
/**
 * just for field reference relation, not for link cell
 */
declare class ReferenceTable extends BaseTableImpl implements BaseTable<IReference> {
  del(id: string): Promise<boolean>;
  name: string;
  createTableSql: string;
  getEffectedFields: (table_name: string, table_column_name: string) => Promise<IField[]>;
}
//# sourceMappingURL=reference.d.ts.map
//#endregion
//#region meta-table/tree/base.d.ts
declare class BaseTreeTable extends BaseTableImpl implements BaseTable<ITreeNode> {
  name: string;
  createTableSql: string;
  getNextRowId: () => Promise<any>;
  add(data: ITreeNode & {
    _skipAutoRename?: boolean;
  }, db?: BaseServerDatabase): Promise<ITreeNode>;
  get(id: string): Promise<ITreeNode | null>;
  updateName(id: string, name: string): Promise<boolean>;
  pin(id: string, is_pinned: boolean): Promise<boolean>;
  del(id: string, db?: BaseServerDatabase): Promise<boolean>;
  makeProxyRow(row: any): ITreeNode;
  query(qs: {
    query?: string;
    withSubNode?: boolean;
  }): Promise<ITreeNode[]>;
  moveIntoTable(id: string, tableId: string, parentId?: string): Promise<boolean>;
  duplicateNode(id: string): Promise<ITreeNode | null>;
  /**
   * id: uuid without '-'
   * miniId: last 8 char of id. most of time, it's enough to identify a node
   * @param idOrMiniId
   */
  getNode(idOrMiniId: string): Promise<ITreeNode | null>;
  /**
   * Check if the unique index exists
   * This is the source of truth for whether node name uniqueness is enabled
   */
  hasUniqueIndex(): Promise<boolean>;
  /**
   * Check if node name uniqueness is enabled for this space
   * Alias for hasUniqueIndex() for semantic clarity
   */
  isNameUniquenessEnabled(): Promise<boolean>;
  /**
   * Find duplicate node names in the tree
   * Returns groups of nodes with the same name under the same parent
   */
  findDuplicateNames(): Promise<Array<{
    parent_id: string | null;
    name: string;
    count: number;
    ids: string[];
  }>>;
  /**
   * Auto-rename duplicate nodes by adding (1), (2), etc.
   * Returns the list of renamed nodes
   */
  migrateDuplicateNames(): Promise<Array<{
    id: string;
    oldName: string;
    newName: string;
  }>>;
  /**
   * Enable node name uniqueness for this space
   * 1. Migrate duplicate names
   * 2. Create unique index
   */
  enableNameUniqueness(): Promise<{
    success: boolean;
    renamed?: Array<{
      id: string;
      oldName: string;
      newName: string;
    }>;
    error?: string;
  }>;
  /**
   * Disable node name uniqueness for this space
   * This drops the unique index
   */
  disableNameUniqueness(): Promise<void>;
  /**
   * Try to create unique index if no duplicates exist
   * This is safe to call on space initialization - it will only create
   * the index if there are no conflicting records.
   * Returns true if index was created or already exists
   */
  tryCreateUniqueIndex(): Promise<boolean>;
  /**
   * Check if a node name is unique under the given parent
   */
  isNameUnique(name: string, parentId: string | null | undefined, excludeId?: string): Promise<boolean>;
  /**
   * Ensure a node name is unique by appending (1), (2), etc. if needed
   * This is used when creating new nodes to avoid name conflicts
   */
  ensureUniqueName(name: string, parentId: string | null | undefined): Promise<string>;
}
//# sourceMappingURL=base.d.ts.map
//#endregion
//#region meta-table/tree/index.d.ts
declare const ComposedTreeTable: {
  new (...args: any[]): {
    createExtNode(ext_node_type: string, parent_id?: string): Promise<string>;
    permanentlyDeleteExtNode(nodeId: string): Promise<void>;
    name: string;
    createTableSql: string;
    getNextRowId: () => Promise<any>;
    add(data: ITreeNode & {
      _skipAutoRename?: boolean;
    }, db?: BaseServerDatabase): Promise<ITreeNode>;
    get(id: string): Promise<ITreeNode | null>;
    updateName(id: string, name: string): Promise<boolean>;
    pin(id: string, is_pinned: boolean): Promise<boolean>;
    del(id: string, db?: BaseServerDatabase): Promise<boolean>;
    makeProxyRow(row: any): ITreeNode;
    query(qs: {
      query?: string;
      withSubNode?: boolean;
    }): Promise<ITreeNode[]>;
    moveIntoTable(id: string, tableId: string, parentId?: string): Promise<boolean>;
    duplicateNode(id: string): Promise<ITreeNode | null>;
    getNode(idOrMiniId: string): Promise<ITreeNode | null>;
    hasUniqueIndex(): Promise<boolean>;
    isNameUniquenessEnabled(): Promise<boolean>;
    findDuplicateNames(): Promise<Array<{
      parent_id: string | null;
      name: string;
      count: number;
      ids: string[];
    }>>;
    migrateDuplicateNames(): Promise<Array<{
      id: string;
      oldName: string;
      newName: string;
    }>>;
    enableNameUniqueness(): Promise<{
      success: boolean;
      renamed?: Array<{
        id: string;
        oldName: string;
        newName: string;
      }>;
      error?: string;
    }>;
    disableNameUniqueness(): Promise<void>;
    tryCreateUniqueIndex(): Promise<boolean>;
    isNameUnique(name: string, parentId: string | null | undefined, excludeId?: string): Promise<boolean>;
    ensureUniqueName(name: string, parentId: string | null | undefined): Promise<string>;
    JSONFields: string[];
    dataSpace: DataSpace;
    initTable(createTableSql: string): void;
    toJson: (data: T) => T;
    columnExists(columnName: string): Promise<boolean>;
    getTableColumns(): Promise<string[]>;
    getRegularTriggers(tableName: string): Promise<{
      name: string;
    }[]>;
    getTempTriggers(tableName: string): Promise<{
      name: string;
    }[]>;
    delBy(data: Partial<any>, db?: BaseServerDatabase): Promise<boolean>;
    transformData: (data: Partial<T>) => {
      kv: any[][];
      updateKPlaceholder: string;
      insertKPlaceholder: string;
      insertVPlaceholder: string;
      deleteKPlaceholder: string;
      values: any[];
    };
    set(id: string, data: Partial<any>): Promise<boolean>;
    list(query?: Partial<any> | undefined, opts?: {
      limit?: number;
      offset?: number;
      orderBy?: string;
      order?: "ASC" | "DESC";
      fields?: string[];
    }): Promise<any[]>;
    findMany(options?: FindManyOptions<any>): Promise<any[]>;
    count(options?: Omit<FindManyOptions<any>, "select" | "orderBy" | "skip" | "take">): Promise<number>;
  };
} & {
  new (...args: any[]): {
    searchTreeByPath(searchTerm: string): Promise<{
      id: string;
      name: string;
      full_path: string;
      depth: number;
      position: number;
      type: string;
    }[]>;
    getNodeFullPath(nodeId: string): Promise<string | null>;
    getAllTreePaths(): Promise<{
      id: string;
      name: string;
      full_path: string;
      depth: number;
      position: number;
      type: string;
    }[]>;
    name: string;
    createTableSql: string;
    getNextRowId: () => Promise<any>;
    add(data: ITreeNode & {
      _skipAutoRename?: boolean;
    }, db?: BaseServerDatabase): Promise<ITreeNode>;
    get(id: string): Promise<ITreeNode | null>;
    updateName(id: string, name: string): Promise<boolean>;
    pin(id: string, is_pinned: boolean): Promise<boolean>;
    del(id: string, db?: BaseServerDatabase): Promise<boolean>;
    makeProxyRow(row: any): ITreeNode;
    query(qs: {
      query?: string;
      withSubNode?: boolean;
    }): Promise<ITreeNode[]>;
    moveIntoTable(id: string, tableId: string, parentId?: string): Promise<boolean>;
    duplicateNode(id: string): Promise<ITreeNode | null>;
    getNode(idOrMiniId: string): Promise<ITreeNode | null>;
    hasUniqueIndex(): Promise<boolean>;
    isNameUniquenessEnabled(): Promise<boolean>;
    findDuplicateNames(): Promise<Array<{
      parent_id: string | null;
      name: string;
      count: number;
      ids: string[];
    }>>;
    migrateDuplicateNames(): Promise<Array<{
      id: string;
      oldName: string;
      newName: string;
    }>>;
    enableNameUniqueness(): Promise<{
      success: boolean;
      renamed?: Array<{
        id: string;
        oldName: string;
        newName: string;
      }>;
      error?: string;
    }>;
    disableNameUniqueness(): Promise<void>;
    tryCreateUniqueIndex(): Promise<boolean>;
    isNameUnique(name: string, parentId: string | null | undefined, excludeId?: string): Promise<boolean>;
    ensureUniqueName(name: string, parentId: string | null | undefined): Promise<string>;
    JSONFields: string[];
    dataSpace: DataSpace;
    initTable(createTableSql: string): void;
    toJson: (data: T) => T;
    columnExists(columnName: string): Promise<boolean>;
    getTableColumns(): Promise<string[]>;
    getRegularTriggers(tableName: string): Promise<{
      name: string;
    }[]>;
    getTempTriggers(tableName: string): Promise<{
      name: string;
    }[]>;
    delBy(data: Partial<any>, db?: BaseServerDatabase): Promise<boolean>;
    transformData: (data: Partial<T>) => {
      kv: any[][];
      updateKPlaceholder: string;
      insertKPlaceholder: string;
      insertVPlaceholder: string;
      deleteKPlaceholder: string;
      values: any[];
    };
    set(id: string, data: Partial<any>): Promise<boolean>;
    list(query?: Partial<any> | undefined, opts?: {
      limit?: number;
      offset?: number;
      orderBy?: string;
      order?: "ASC" | "DESC";
      fields?: string[];
    }): Promise<any[]>;
    findMany(options?: FindManyOptions<any>): Promise<any[]>;
    count(options?: Omit<FindManyOptions<any>, "select" | "orderBy" | "skip" | "take">): Promise<number>;
  };
} & {
  new (...args: any[]): {
    getAllDescendantsForDeletion(id: string): Promise<ITreeNode[]>;
    getAllDescendants(id: string, onlyDeleted?: boolean): Promise<ITreeNode[]>;
    listNodes(query?: string, withSubNode?: boolean): Promise<any[]>;
    pinNode(id: string, isPinned: boolean): Promise<boolean>;
    toggleNodeFullWidth(id: string, isFullWidth: boolean): Promise<boolean>;
    toggleNodeLock(id: string, isLocked: boolean): Promise<boolean>;
    permanentlyDeleteNode(id: string): Promise<void>;
    permanentlyDeleteNodeByType(node: ITreeNode): Promise<void>;
    updateNodeName(id: string, name: string): Promise<void>;
    addNode(data: any): Promise<any>;
    getOrCreateNode(data: any): Promise<any>;
    nodeChangeParent(id: string, parentId?: string, opts?: {
      targetId: string;
      targetDirection: "up" | "down";
    } | undefined): Promise<Partial<any>>;
    restoreNode(id: string): Promise<boolean>;
    deleteNode(id: string): Promise<boolean>;
    checkLoop(id: string, parentId: string): Promise<void>;
    getAdjacencyList(): Promise<Map<string, string[]>>;
    getPosition(props: {
      parentId?: string;
      targetId: string;
      targetDirection: "up" | "down";
    }): Promise<number>;
    updateNodePosition(id: string, position: number): Promise<boolean>;
    getNodeIdPath(nodeId: string): Promise<string | null>;
    name: string;
    createTableSql: string;
    getNextRowId: () => Promise<any>;
    add(data: ITreeNode & {
      _skipAutoRename?: boolean;
    }, db?: BaseServerDatabase): Promise<ITreeNode>;
    get(id: string): Promise<ITreeNode | null>;
    updateName(id: string, name: string): Promise<boolean>;
    pin(id: string, is_pinned: boolean): Promise<boolean>;
    del(id: string, db?: BaseServerDatabase): Promise<boolean>;
    makeProxyRow(row: any): ITreeNode;
    query(qs: {
      query?: string;
      withSubNode?: boolean;
    }): Promise<ITreeNode[]>;
    moveIntoTable(id: string, tableId: string, parentId?: string): Promise<boolean>;
    duplicateNode(id: string): Promise<ITreeNode | null>;
    getNode(idOrMiniId: string): Promise<ITreeNode | null>;
    hasUniqueIndex(): Promise<boolean>;
    isNameUniquenessEnabled(): Promise<boolean>;
    findDuplicateNames(): Promise<Array<{
      parent_id: string | null;
      name: string;
      count: number;
      ids: string[];
    }>>;
    migrateDuplicateNames(): Promise<Array<{
      id: string;
      oldName: string;
      newName: string;
    }>>;
    enableNameUniqueness(): Promise<{
      success: boolean;
      renamed?: Array<{
        id: string;
        oldName: string;
        newName: string;
      }>;
      error?: string;
    }>;
    disableNameUniqueness(): Promise<void>;
    tryCreateUniqueIndex(): Promise<boolean>;
    isNameUnique(name: string, parentId: string | null | undefined, excludeId?: string): Promise<boolean>;
    ensureUniqueName(name: string, parentId: string | null | undefined): Promise<string>;
    JSONFields: string[];
    dataSpace: DataSpace;
    initTable(createTableSql: string): void;
    toJson: (data: T) => T;
    columnExists(columnName: string): Promise<boolean>;
    getTableColumns(): Promise<string[]>;
    getRegularTriggers(tableName: string): Promise<{
      name: string;
    }[]>;
    getTempTriggers(tableName: string): Promise<{
      name: string;
    }[]>;
    delBy(data: Partial<any>, db?: BaseServerDatabase): Promise<boolean>;
    transformData: (data: Partial<T>) => {
      kv: any[][];
      updateKPlaceholder: string;
      insertKPlaceholder: string;
      insertVPlaceholder: string;
      deleteKPlaceholder: string;
      values: any[];
    };
    set(id: string, data: Partial<any>): Promise<boolean>;
    list(query?: Partial<any> | undefined, opts?: {
      limit?: number;
      offset?: number;
      orderBy?: string;
      order?: "ASC" | "DESC";
      fields?: string[];
    }): Promise<any[]>;
    findMany(options?: FindManyOptions<any>): Promise<any[]>;
    count(options?: Omit<FindManyOptions<any>, "select" | "orderBy" | "skip" | "take">): Promise<number>;
  };
} & typeof BaseTreeTable;
declare class TreeTable extends ComposedTreeTable {}
//# sourceMappingURL=index.d.ts.map
//#endregion
//#region meta-table/view.d.ts
declare class ViewTable extends BaseTableImpl implements BaseTable<IView> {
  name: string;
  createTableSql: string;
  JSONFields: string[];
  add(data: IView): Promise<IView>;
  del(id: string): Promise<boolean>;
  deleteByTableId(table_id: string, db?: BaseServerDatabase): Promise<void>;
  updateQuery(id: string, query: string): Promise<void>;
  createDefaultView(tableName: string, type?: ViewType): Promise<IView<any>>;
  isRowExistInQuery(table_id: string, rowId: string, query: string): Promise<boolean>;
  findRowIndexInQuery(table_id: string, rowId: string, query: string): Promise<number>;
  recompute(table_id: string, rowIds: string[]): Promise<any>;
  private getLastPosition;
  getPosition(props: {
    tableId: string;
    targetId: string;
    targetDirection: "up" | "down";
  }): Promise<number>;
  updatePosition(id: string, position: number): Promise<void>;
  /**
   * Update view position when dragging
   * @param dragId The id of the view being dragged
   * @param targetId The id of the target view
   * @param direction The direction relative to target ("up" | "down")
   * @param tableId The table id that these views belong to
   */
  movePosition(props: {
    dragId: string;
    targetId: string;
    direction: "up" | "down";
    tableId: string;
  }): Promise<void>;
  /**
   * Batch reorder views
   * @param viewIds Array of view ids in desired order (first = highest position)
   */
  reorderViews(viewIds: string[]): Promise<void>;
  private checkAndReorderIfNeeded;
}
//# sourceMappingURL=view.d.ts.map
//#endregion
//#region sdk/sql-data-view.d.ts
declare class SqlDataView {
  private dataSpace;
  constructor(dataSpace: DataSpace);
  /**
   * Get the appropriate database connection based on db hint
   * @param dbHint Database hint ('opendata' or undefined for default)
   * @returns Database connection
   */
  private getDb;
  /**
   * Get database hint from view metadata
   */
  private getViewDbHint;
  delete(id: string): Promise<void>;
  getAllDataViewIds(): Promise<any[]>;
  isDataViewExist(id: string): Promise<boolean>;
  getViewRawQuery(tableName: string, dbHint?: string): Promise<any>;
  getViewColumns(id: string): Promise<any[]>;
  getViewFields(id: string): Promise<IField[]>;
  updateViewColumn({
    tableName,
    tableColumnName,
    type,
    property
  }: {
    tableName: string;
    tableColumnName: string;
    type: FieldType;
    property: any;
  }): Promise<void>;
  createDataView(id: string, createViewSql: string, isTemp?: boolean): Promise<boolean>;
  /**
   * Create column metadata from SQL comments
   * @param viewName The view name
   * @param createViewSql The SQL used to create the view
   */
  private createColumnMetadataFromComments;
  createTableFromDataView(viewNodeId: string, newTableName: string, titleColumnName?: string): Promise<string>;
  /**
   * Search dataview with LIKE query (not FTS)
   * Return format is consistent with TableFullTextSearch.search()
   *
   * @param viewName View name (e.g., "vw_xxx")
   * @param query Search query
   * @param page Page number (1-based)
   * @param pageSize Page size
   * @returns Search result in the same format as FTS
   */
  search(viewName: string, query: string, page?: number, pageSize?: number): Promise<{
    results: {
      row: any;
      matches: {
        column: string;
        snippet: string;
      }[];
      rowIndex: any;
    }[];
    searchTime: number;
    totalMatches: any;
    currentPage: number;
    totalPages: number;
  }>;
}
//# sourceMappingURL=sql-data-view.d.ts.map
//#endregion
//#region sdk/theme-manager.d.ts
/**
 * Theme manager for space-based themes
 * Themes are stored in <space>/.eidos/themes/<theme-name>/theme.css
 */
declare class ThemeManager {
  private dataSpace;
  constructor(dataSpace: DataSpace);
  private get fs();
  /**
   * List all available theme names
   */
  list(): Promise<string[]>;
  /**
   * Get theme CSS content
   */
  get(name: string): Promise<string | null>;
  /**
   * Install or update a theme
   */
  install(name: string, css: string): Promise<void>;
  /**
   * Uninstall a theme
   */
  uninstall(name: string): Promise<void>;
  /**
   * Get current theme name
   */
  getCurrent(): Promise<string | null>;
  /**
   * Set current theme (null to reset to default)
   */
  setCurrent(name: string | null): Promise<void>;
  /**
   * Get theme directory path
   */
  getDirectory(): string;
}
//# sourceMappingURL=theme-manager.d.ts.map
//#endregion
//#region types/IExternalFileSystem.d.ts
/**
 * Serializable directory entry that can be passed through message communication
 * Replaces Node.js Dirent for IPC compatibility
 */
interface IDirectoryEntry {
  /** Entry name (matches Dirent.name behavior: filename in non-recursive, relative path in recursive) */
  name: string;
  /** Relative path from queried directory (matches Node.js readdir recursive behavior) */
  path: string;
  /** Parent directory path relative to queried directory */
  parentPath: string;
  /** Entry type */
  kind: "file" | "directory" | "blockDevice" | "characterDevice" | "symbolicLink" | "fifo" | "socket";
  /** Optional metadata for virtual file system entries */
  metadata?: {
    nodeType?: "table" | "doc" | "folder" | "extension" | "dataview" | `ext__${string}`;
    nodeId?: string;
    isPinned?: boolean;
    icon?: string;
    /** Extension type (only for nodeType === "extension") */
    extensionType?: "script" | "block";
    /** Path based on node names (instead of IDs) */
    namePath?: string;
    /** ID-based virtual path (rooted at ~/.eidos/__NODES__) */
    idPath?: string;
    /** Original slug for extension entries (for hierarchical display) */
    slug?: string;
    /** Whether this is a virtual folder created from slug prefix */
    isVirtualFolder?: boolean;
  };
}
/**
 * Options for readdir
 */

/**
 * Options for mkdir
 */
interface IMkdirOptions {
  recursive?: boolean;
}
/**
 * Options for readFile
 */
interface IReadFileOptions {
  encoding?: BufferEncoding | null;
  flag?: string;
}
/**
 * Options for writeFile
 */
interface IWriteFileOptions {
  encoding?: BufferEncoding | null;
  mode?: number;
  flag?: string;
}
/**
 * Serializable file stats object (no methods, only properties)
 * Compatible with Node.js fs.Stats but serializable for IPC
 */
interface IStats {
  size: number;
  mtimeMs: number;
  atimeMs: number;
  ctimeMs: number;
  birthtimeMs: number;
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink: boolean;
  isBlockDevice: boolean;
  isCharacterDevice: boolean;
  isFIFO: boolean;
  isSocket: boolean;
  mode: number;
  uid: number;
  gid: number;
}
/**
 * Watch event interface
 * Compatible with Node.js fs watch event
 */
interface IWatchEvent {
  eventType: "rename" | "change";
  filename: string;
}
/**
 * Watch options interface
 * Compatible with Node.js fs watch options
 */
interface IWatchOptions {
  encoding?: BufferEncoding;
  persistent?: boolean;
  recursive?: boolean;
  signal?: AbortSignal;
}
/**
 * External file system interface
 * API follows Node.js fs/promises
 *
 * Supports:
 * - ~/ (project folder)
 * - @/ (mounted folders)
 */
interface IExternalFileSystem {
  /**
   * List directory contents (like fs.readdir)
   * @param path Directory path (~/ or @/)
   * @param options Read options
   * @returns Array of file names or IDirectoryEntry objects
   */
  readdir(path: string, options: {
    withFileTypes: true;
    recursive?: boolean;
  }): Promise<IDirectoryEntry[]>;
  readdir(path: string, options?: {
    withFileTypes?: false;
    recursive?: boolean;
  }): Promise<string[]>;
  /**
   * Create directory (like fs.mkdir)
   * @param path Directory path to create
   * @param options Creation options
   * @returns Created directory path or undefined
   */
  mkdir(path: string, options?: IMkdirOptions): Promise<string | undefined>;
  /**
   * Read file contents (like fs.readFile)
   * @param path File path (~/ or @/)
   * @param options Encoding or read options
   * @returns File contents as Uint8Array (binary) or string (with encoding)
   */
  readFile(path: string): Promise<Uint8Array>;
  readFile(path: string, options: {
    encoding: BufferEncoding;
    flag?: string;
  } | BufferEncoding): Promise<string>;
  readFile(path: string, options?: IReadFileOptions | BufferEncoding): Promise<string | Uint8Array>;
  /**
   * Write file contents (like fs.writeFile)
   * @param path File path (~/ or @/)
   * @param data File contents as string or Uint8Array
   * @param options Encoding or write options
   */
  writeFile(path: string, data: string | Uint8Array, options?: IWriteFileOptions | BufferEncoding): Promise<void>;
  /**
   * Get file stats (like fs.stat)
   * @param path File path (~/ or @/)
   * @returns Serializable file stats object
   */
  stat(path: string): Promise<IStats>;
  /**
   * Rename file or directory (like fs.rename)
   * @param oldPath Current path
   * @param newPath New path
   */
  rename(oldPath: string, newPath: string): Promise<void>;
  /**
   * Watch for changes on a file or directory (like fs.watch)
   * @param path File or directory path to watch
   * @param options Watch options
   * @returns AsyncIterable of watch events
   */
  watch(path: string, options?: IWatchOptions): AsyncIterable<IWatchEvent>;
  /**
   * Delete a file (like fs.unlink)
   * @param path File path
   */
  unlink(path: string): Promise<void>;
  /**
   * Delete a directory (like fs.rmdir)
   * @param path Directory path
   */
  rmdir(path: string): Promise<void>;
  /**
   * Search for files
   * @param query Search query
   * @param searchPaths Optional array of paths to search within (defaults to all)
   * @returns Array of matching file paths (virtual paths)
   */
  search(query: string, searchPaths?: string[]): Promise<string[]>;
}
//# sourceMappingURL=IExternalFileSystem.d.ts.map
//#endregion
//#region data-space/base.d.ts
type EidosDatabase = BaseServerDatabase;
declare abstract class BaseDataSpace {
  db: EidosDatabase;
  draftDb: BaseServerDatabase | undefined;
  opendataDb?: EidosDatabase;
  undoRedoManager: SQLiteUndoRedo;
  activeUndoManager: boolean;
  dbName: string;
  doc: DocTable;
  script: ExtensionTable;
  extension: ExtensionTable;
  tree: TreeTable;
  view: ViewTable;
  column: ColumnTable;
  reference: ReferenceTable;
  embedding: EmbeddingTable;
  chat: ChatTable;
  message: MessageTable;
  file: FileTable;
  extNode: ExtNodeTable;
  kv: KVTable;
  theme: ThemeManager;
  dataView: SqlDataView;
  dataChangeTrigger: DataChangeTrigger;
  linkRelationUpdater: LinkRelationUpdater;
  allTables: BaseTable<any>[];
  postMessage?: (data: any, transfer?: any[]) => void;
  callRenderer?: (type: any, data: any) => Promise<any>;
  dataEventChannel: BroadcastChannel;
  eventHandler: DataChangeEventHandler;
  externalFS?: IExternalFileSystem;
  syncClient?: any;
  hasMigrated: boolean;
  tableFullTextSearch: TableFullTextSearch;
  tableSemanticSearch: TableSemanticSearch;
  isUDFWithCtx: boolean;
  context: {
    setInterval?: typeof setInterval;
    embedding?: (text: string) => Promise<Array<number>>;
    /**
     * Extension compiler function. Injected by desktop/headless layer.
     * Compiles TypeScript/TSX code and extracts metadata.
     */
    compileExtension?: (code: string, filename: string) => Promise<{
      compiledCode: string;
      meta: any;
      type: "block" | "script";
      name: string;
      description: string;
      slugPrefix: string;
    }>;
  };
  constructor(config: {
    db: EidosDatabase;
    opendataDb?: EidosDatabase;
    activeUndoManager: boolean;
    dbName: string;
    context: {
      setInterval?: typeof setInterval;
      embedding?: (text: string) => Promise<Array<number>>;
      compileExtension?: (code: string, filename: string) => Promise<{
        compiledCode: string;
        meta: any;
        type: "block" | "script";
        name: string;
        description: string;
        slugPrefix: string;
      }>;
    };
    createUDF?: (db: EidosDatabase) => void;
    draftDb?: EidosDatabase;
    postMessage?: (data: any, transfer?: any[]) => void;
    callRenderer?: (type: any, data: any) => Promise<any>;
    externalFS?: IExternalFileSystem;
    dataEventChannel: BroadcastChannel;
    cacheSize?: number;
    isUDFWithCtx?: boolean;
    enableFTS?: boolean;
    syncClient?: any;
  });
  getSpaceName(): Promise<string>;
  protected setCacheSize(size: number): void;
  protected initUDF(): void;
  protected initMetaTable(db?: EidosDatabase): void;
  onTableChange(space: string, tableName: string, toDeleteColumns?: string[]): Promise<void>;
  addEmbedding(embedding: IEmbedding): Promise<IEmbedding>;
  isRowExistInQuery(tableId: string, rowId: string, query: string): Promise<boolean>;
  getRecomputeRows(tableId: string, rowIds: string[]): Promise<any>;
  addField(data: IField): Promise<IField>;
  deleteField(tableName: string, tableColumnName: string): Promise<string[]>;
  listRawColumns(tableName: string): Promise<{
    [columnName: string]: any;
  }[]>;
  importCsv(file: {
    name: string;
    content: string;
  }): Promise<string>;
  exportCsv(tableId: string): Promise<string>;
  importMarkdown(file: {
    name: string;
    content: string;
  }): Promise<string>;
  exportMarkdown(nodeId: string): Promise<string>;
  listUiColumns(tableName: string): Promise<IField[]>;
  /**
   * this will return all ui columns in this space
   * @param tableName
   * @returns
   */
  listAllUiColumns(): Promise<any>;
  undo(): void;
  redo(): void;
  protected activeTablesUndoRedo(tables: string[]): Promise<void>;
  abstract syncExec2(sql: string, bind?: any[], db?: any): Promise<any>;
  onUpdate(): void;
  notify(msg: string | {
    title: string;
    description: string;
    actions?: Array<{
      label: string;
      action: "reload" | "dismiss";
      variant?: "primary" | "secondary";
    }>;
  }): void;
  /**
   * navigate to node in the same space
   * @param path e.g. "/<nodeId>"
   * @param options navigation options
   * @example
   * eidos.currentSpace.navigate("/<tableId>")
   * eidos.currentSpace.navigate("/<docId>")
   * eidos.currentSpace.navigate("/2025-09-30")
   * eidos.currentSpace.navigate("/extensions/<extensionId>")
   * eidos.currentSpace.navigate("/blocks/<blockId>")
   * eidos.currentSpace.navigate("/<docId>", { target: "_blank" }) // open in new tab
   */
  navigate(path: string, options?: {
    target?: "_blank" | "_self";
  }): void;
  blockUIMsg(msg: string | null, data?: {
    progress?: number;
  }): void;
  /**
   * Run server-side action in a sandboxed VM
   * This is used by the extension server to execute getServerSideProps
   * in the process where the real DataSpace instance lives.
   */
  runServerAction(code: string, options: {
    url: string;
  }): Promise<any>;
}
//# sourceMappingURL=base.d.ts.map
//#endregion
//#region sdk/fs.d.ts
/**
 * File system SDK for external files
 * Environment-agnostic wrapper around IExternalFileSystem
 *
 * API follows Node.js fs/promises for familiarity
 */
declare class FSManager {
  dataSpace: BaseDataSpace;
  private _virtualAdapter?;
  constructor(dataSpace: BaseDataSpace);
  private get externalFS();
  /**
   * List directory contents
   *
   * @example
   * // Get file names
   * const files = await eidos.currentSpace.fs.readdir("~/")
   * console.log(files) // ["package.json", "src", "README.md"]
   *
   * @example
   * // Get directory entries with type information
   * const entries = await eidos.currentSpace.fs.readdir("~/", { withFileTypes: true })
   * entries.forEach(e => console.log(e.name, e.kind === 'directory'))
   *
   * @example
   * // Recursively list all files
   * const allFiles = await eidos.currentSpace.fs.readdir("~/", { recursive: true })
   * console.log(allFiles) // ["package.json", "src/index.ts", "src/utils/helper.ts", ...]
   *
   * @example
   * // List mounted folder
   * const music = await eidos.currentSpace.fs.readdir("@/music")
   */
  readdir(path: string, options: {
    withFileTypes: true;
    recursive?: boolean;
  }): Promise<IDirectoryEntry[]>;
  readdir(path: string, options?: {
    withFileTypes?: false;
    recursive?: boolean;
  }): Promise<string[]>;
  /**
   * Create directory
   *
   * @example
   * // Create single directory
   * await eidos.currentSpace.fs.mkdir("@/work/projects")
   *
   * @example
   * // Create nested directories
   * await eidos.currentSpace.fs.mkdir("@/work/2024/Q1", { recursive: true })
   */
  mkdir(path: string, options?: IMkdirOptions): Promise<string | undefined>;
  /**
   * Read file contents
   *
   * @example
   * // Read binary file
   * const data = await eidos.currentSpace.fs.readFile("~/image.png")
   * console.log(data) // Uint8Array
   *
   * @example
   * // Read text file with encoding
   * const text = await eidos.currentSpace.fs.readFile("~/readme.md", "utf8")
   * console.log(text) // string
   *
   * @example
   * // Read with options
   * const content = await eidos.currentSpace.fs.readFile("~/data.json", { encoding: "utf8" })
   */
  readFile(path: string): Promise<Uint8Array>;
  readFile(path: string, options: {
    encoding: BufferEncoding;
    flag?: string;
  } | BufferEncoding): Promise<string>;
  /**
   * Write file contents
   *
   * @example
   * // Write text file
   * await eidos.currentSpace.fs.writeFile("~/hello.txt", "Hello, World!")
   *
   * @example
   * // Write binary file
   * const data = new Uint8Array([0x89, 0x50, 0x4E, 0x47])
   * await eidos.currentSpace.fs.writeFile("~/data.bin", data)
   *
   * @example
   * // Write with encoding
   * await eidos.currentSpace.fs.writeFile("~/config.json", JSON.stringify(config), "utf8")
   */
  writeFile(path: string, data: string | Uint8Array, options?: IWriteFileOptions | BufferEncoding): Promise<void>;
  /**
   * Get file statistics
   *
   * @example
   * // Get file stats
   * const stats = await eidos.currentSpace.fs.stat("~/readme.md")
   * console.log(stats.size) // file size in bytes
   * console.log(stats.isFile) // true
   * console.log(stats.isDirectory) // false
   * console.log(new Date(stats.mtimeMs)) // last modified time
   */
  stat(path: string): Promise<IStats>;
  /**
   * Check if file or directory exists
   *
   * @example
   * if (await eidos.currentSpace.fs.exists("~/config.json")) {
   *   console.log("Config exists")
   * }
   */
  exists(path: string): Promise<boolean>;
  /**
   * Rename file or directory
   *
   * @example
   * // Rename a file
   * await eidos.currentSpace.fs.rename("~/old-name.md", "~/new-name.md")
   *
   * @example
   * // Rename a node
   * await eidos.currentSpace.fs.rename(
   *   "~/.eidos/__NODES__/node-id",
   *   "~/.eidos/__NODES__/New Name"
   * )
   *
   * @example
   * // Rename an extension
   * await eidos.currentSpace.fs.rename(
   *   "~/.eidos/__EXTENSIONS__/ext-id",
   *   "~/.eidos/__EXTENSIONS__/new-slug.ts"
   * )
   */
  rename(oldPath: string, newPath: string): Promise<void>;
  /**
   * Delete a file
   *
   * @example
   * await eidos.currentSpace.fs.unlink("~/file.txt")
   */
  unlink(path: string): Promise<void>;
  /**
   * Delete a directory
   *
   * @example
   * await eidos.currentSpace.fs.rmdir("~/folder")
   */
  rmdir(path: string): Promise<void>;
  /**
   * Watch for changes on a file or directory
   *
   * @example
   * // Watch nodes for changes
   * for await (const event of eidos.currentSpace.fs.watch("~/.eidos/__NODES__/")) {
   *   console.log(`Node ${event.filename} ${event.eventType}`)
   * }
   *
   * @example
   * // Watch specific folder with recursive option
   * for await (const event of eidos.currentSpace.fs.watch(
   *   "~/.eidos/__NODES__/folder-id/",
   *   { recursive: true }
   * )) {
   *   console.log(`File ${event.filename} ${event.eventType}`)
   * }
   *
   * @example
   * // Watch with AbortSignal
   * const controller = new AbortController()
   * const { signal } = controller
   *
   * setTimeout(() => controller.abort(), 5000)
   *
   * for await (const event of eidos.currentSpace.fs.watch(
   *   "~/.eidos/__EXTENSIONS__/",
   *   { signal }
   * )) {
   *   console.log(`Extension ${event.filename} ${event.eventType}`)
   * }
   */
  watch(path: string, options?: IWatchOptions): AsyncIterable<IWatchEvent>;
  /**
   * Search for files
   *
   * @example
   * const results = await eidos.currentSpace.fs.search("query")
   */
  search(query: string, searchPaths?: string[]): Promise<string[]>;
}
//# sourceMappingURL=fs.d.ts.map
//#endregion
//#region data-space/db.d.ts
declare class DataSpaceWithDatabase extends BaseDataSpace {
  status(): Promise<Record<string, any>>;
  pull(): Promise<Record<string, any>>;
  push(): Promise<Record<string, any>>;
  fetch(): Promise<Record<string, any>>;
  hydrate(): Promise<Record<string, any>>;
  snapshot(): Promise<Record<string, any>>;
  tags(): Promise<Record<string, any>>;
  volumes(): Promise<Record<string, any>>;
  clone(remoteLogId?: string): Promise<Record<string, any>>;
  convertToGraft(remote: string): Promise<Record<string, any>>;
  exportToSqlite(outputPath?: string): Promise<Record<string, any>>;
  info(): Promise<Record<string, any>>;
  audit(): Promise<Record<string, any>>;
  close(): void;
  syncExec2(sql: string, bind?: any[], db?: BaseServerDatabase): Promise<any>;
  exec2(sql: string, bind?: any[]): Promise<any>;
  execute(sql: string, bind?: any[]): Promise<{
    fetchone: () => any;
    fetchall: () => any[];
  }>;
  exec(sql: string, bind?: any[]): void;
  protected execSqlWithBind(sql: string, bind?: any[], rowMode?: "object" | "array", db?: BaseServerDatabase): Promise<any[]>;
  /**
   * it's a template string function, to execute sql. safe from sql injection
   * table name and column name need to be Symbol, like Symbol('table_name') or Symbol('column_name')
   *
   * example:
   * const tableName = "books"
   * const id = 42
   * sql`select ${Symbol("title")} from ${Symbol('table_name')} where id = ${id}`.then(logger.info)
   * @param strings
   * @param values
   * @returns
   */
  sql(strings: TemplateStringsArray, ...values: any[]): Promise<any[]>;
  sql2: (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>;
  sqlQuery2(sql: string, bind?: any[]): Promise<any[]>;
  sqlQuery: (sql: string, bind?: any[], rowMode?: "object" | "array") => Promise<any[]>;
  /**
   * Get the appropriate database connection based on db hint
   * @param dbHint Database hint ('opendata' or undefined for default)
   * @returns Database connection
   */
  private getDbByHint;
  /**
   * Extract table name from SQL query (simple regex-based extraction)
   * Supports: SELECT ... FROM tableName, SELECT ... FROM tableName WHERE ..., etc.
   */
  private extractTableNameFromSql;
  /**
   * Resolve target database for SQL execution
   * Only DataViews (vw_*) may need to switch database based on _db_hint
   * All other queries use the default database
   */
  private resolveTargetDb;
  /**
   * Symbol can't be transformed between main thread and worker thread.
   * so we need to parse sql in main thread, then call this function. it will equal to call `sql` function in worker thread
   * be careful, it just parse sql before, the next logic need to be same with `sql` function
   * @param sql
   * @param bind
   * @returns
   */
  sql4mainThread(sql: string, bind?: any[], rowMode?: "object" | "array"): Promise<any[]>;
  sql4mainThread2(sql: string, bind?: any[]): Promise<any[]>;
}
//# sourceMappingURL=db.d.ts.map
//#endregion
//#region data-space/file.d.ts
declare class DataSpaceWithFile extends DataSpaceWithDatabase {
  private fileWatcherController;
  getFileByPath(path: string): Promise<IFile | null>;
  delFileByPath(path: string): Promise<boolean | undefined>;
  /**
   * External file system operations (~/ and @/)
   * API follows Node.js fs/promises
   */
  get fs(): FSManager;
  /**
   * Initialize file watcher for .eidos/files/
   *
   * NOTE: File watcher is now disabled for database updates.
   *
   * Design change: To maintain consistency between database and file sync,
   * we no longer automatically update the eidos__files table when local files change.
   *
   * - Files are still auto-synced to cloud via FileSynchronizer
   * - Database records are only updated through explicit API calls (upload, etc.)
   * - This ensures database (Graft) remains the source of truth
   *
   * The watcher loop is kept for debugging/observability but does not modify database state.
   */
  initFileWatcher(): Promise<void>;
  /**
   * Stop file watcher to avoid resource consumption
   */
  unwatchFileWatcher(): void;
  private watchLoop;
  /**
   * Sync file metadata to database
   * This is now an explicit operation, not triggered by file system events
   * Called when files are uploaded through the API
   */
  syncFileToDatabase(path: string): Promise<IFile | null>;
  /**
   * Remove file metadata from database
   * Explicit operation for when files are deleted through the API
   */
  removeFileFromDatabase(path: string): Promise<void>;
}
//# sourceMappingURL=file.d.ts.map
//#endregion
//#region data-space/doc.d.ts
declare class DataSpaceWithDoc extends DataSpaceWithFile {
  addDoc(docId: string, content: string, markdown: string, isDayPage?: boolean): Promise<void>;
  updateDoc(docId: string, content: string, markdown: string, _isDayPage?: boolean): Promise<void>;
  getDoc(docId: string): Promise<any>;
  lexical2markdown(docId: string, {
    withTitle
  }?: {
    withTitle?: boolean;
  }): Promise<any>;
  lexical2markdownBatch(docIds: string[]): Promise<{
    id: string;
    markdown: string;
  }[]>;
  searchDayPages(term: string, page?: number, pageSize?: number): Promise<{
    id: string;
    markdown: string;
  }[]>;
  /**
   * if you want to create or update a day page, you should pass a day page id. page id is like 2021-01-01
   * @param docId
   * @param mdStr
   * @param parent_id
   * @returns
   */
  createOrUpdateDocWithMarkdown(docId: string, mdStr: string, parent_id?: string, title?: string, mode?: "replace" | "append" | "prepend"): Promise<any>;
  createOrUpdateDoc(data: {
    docId: string;
    content: string;
    type: "html" | "markdown" | "email";
    parent_id?: string;
    title?: string;
    mode?: "replace" | "append" | "prepend";
  }): Promise<any>;
  deleteDoc(docId: string): Promise<void>;
  listAllDocIds(): Promise<string[]>;
  fullTextSearch(query: string, options?: {
    onlyDayPages?: boolean;
  }): Promise<{
    id: string;
    result: string;
  }[]>;
  listDays(page: number): Promise<any>;
  listAllDays(): Promise<any>;
}
//# sourceMappingURL=doc.d.ts.map
//#endregion
//#region data-space/node.d.ts
/**
 * Extension class to add Node API to DataSpace
 * Inherits from DataSpaceWithDoc to add node operations
 */
declare class DataSpaceWithNode extends DataSpaceWithDoc {
  private _nodeClient?;
  /**
   * Node API - unified interface for node operations
   *
   * @example
   * ```typescript
   * // Get node by path
   * const node = await dataSpace.node.get("projects/roadmap")
   *
   * // Create document
   * await dataSpace.node.create("notes/idea", "doc")
   *
   * // Move node
   * await dataSpace.node.move("a", "b")
   * ```
   */
  get node(): NodeClient;
}
//# sourceMappingURL=node.d.ts.map
//#endregion
//#region data-space/table.d.ts
declare class DataSpaceWithTable extends DataSpaceWithNode {
  /**
   * Schema management client for table/field/view lifecycle operations.
   *
   * @example
   * ```typescript
   * const table = await eidos.currentSpace.schema.createTable({
   *   name: "Tasks",
   *   fields: [
   *     { name: "Status", columnName: "status", type: "select" },
   *     { name: "Due Date", columnName: "due_date", type: "date" },
   *   ]
   * })
   * ```
   */
  get schema(): SchemaClient;
  /**
   * @deprecated Use table() instead. This is the legacy API that returns TableManager.
   * Kept for internal use and backward compatibility.
   */
  _table(id: string): TableManager;
  /**
   * Prisma-style Table SDK client for CRUD operations
   * Operates directly on database column names for simplified usage
   *
   * @example
   * ```typescript
   * const Users = eidos.currentSpace.table("users")
   * await Users.create({ data: { cl_name: "张三" } })
   * await Users.findMany({ where: { cl_age: { gte: 18 } } })
   * ```
   */
  table(id: string): TableClient<Record<string, any>>;
  rebuildFTS(tableId: string): Promise<void>;
  semanticSearch: (params: {
    tableName: string;
    query: string;
    viewId?: string;
    fieldId?: string;
    page: number;
    pageSize: number;
  }) => Promise<{
    meta: {
      embeddingFieldId: string;
      page: number;
      pageSize: number;
    };
    results: any;
  }>;
  getLookupContext(tableName: string, columnName: string): Promise<ILookupContext | null>;
  deleteSelectOption: (field: IField, option: string) => Promise<void>;
  updateSelectOptionName: (field: IField, update: {
    from: string;
    to: string;
  }) => Promise<void>;
  updateEmbedding: (tableId: string, fieldId: string, data: {
    recordId: string;
    value: string;
  }[]) => Promise<void>;
  queryEmbedding: (tableId: string, fieldId: string, query: string, limit?: number) => Promise<any>;
  getEmbeddingStats: (tableId: string, fieldId: string) => Promise<{
    total: number;
    vectorized: number;
    outdated: number;
    upToDate: number;
    vectorizedPercentage: number;
    outdatedPercentage: number;
    upToDatePercentage: number;
  }>;
  resetEmbedding: (tableId: string, fieldId: string) => Promise<void>;
  updateLookupColumn(tableName: string, columnName: string): Promise<void>;
  createTableIndex(tableId: string, column: string): void;
  setRow(tableId: string, rowId: string, data: any): Promise<{
    _last_edited_time: string;
    _last_edited_by: string | null;
    id: string;
  }>;
  setCell(data: {
    tableId: string;
    rowId: string;
    fieldId: string;
    value: any;
  }): Promise<void>;
  getRow(tableId: string, rowId: string): Promise<Record<string, any> | null>;
  /**
   * Starting from v0.5.0, we switched to using uuidv7 as the _id, and the logic of deleteRowsByRange changed from sorting by rowid to sorting by _id.
   * This function is suitable for old versions of tables where _id of row is uuidv4, and data cannot be deleted by selection, but by a list of _id values.
   * There are some limitations, such as the maximum number of records that can be deleted at once is limited by the sqlite bind parameter.
   * @param rowIds
   * @param tableId
   */
  deleteRowsByIds(ids: string[], tableName: string): Promise<void>;
  /**
   * Delete sub-documents associated with table rows.
   * When a row is expanded, a sub-document with id = shortenId(row._id) and parent_id = tableId is created.
   * This method deletes those sub-documents when the rows are deleted.
   *
   * Uses batch query to find sub-docs, then deletes them serially to maintain consistency.
   */
  private deleteSubDocsForRows;
  deleteRowsByRange(range: {
    startIndex: number;
    endIndex: number;
  }[], tableName: string, query: string): Promise<void>;
  createRecords(table_id: string, records: Record<string, any>[]): Promise<Record<string, any>[]>;
  addRow(tableName: string, data: Record<string, any>, options?: {
    useFieldId?: boolean;
  }): Promise<Record<string, any>>;
  createTable(fields: Array<{
    name: string;
    type: FieldType;
  }>, name: string): Promise<string>;
  createTableViaSchema(id: string, name: string, tableSchema: string, parent_id?: string): Promise<void>;
  fixTable(tableId: string): Promise<void>;
  hasSystemColumn(tableId: string, column: string): Promise<any>;
  isTableExist(id: string): Promise<boolean>;
  deleteTable(id: string): Promise<void>;
  createTableFTS(tableName: string, temporary?: boolean): Promise<void>;
  searchTableFTS(tableName: string, query: string, viewId: string, page?: number, pageSize?: number): Promise<{
    results: {
      row: any;
      matches: {
        column: any;
        snippet: any;
      }[];
      rowIndex: any;
    }[];
    searchTime: number;
    totalMatches: any;
    currentPage: number;
    totalPages: number;
  }>;
  hasTableFTS(tableName: string): Promise<boolean>;
  runAIgeneratedSQL(sql: string, tableName: string): Promise<Record<string, any>[]>;
  /**
   * Migrate file paths in file fields from old format (/{spaceName}/files/) to new format (/files/)
   * @param tableId The table ID to migrate
   * @returns Migration statistics
   */
  migrateTableFilePaths(tableId: string): Promise<{
    migrated: number;
    errors: number;
  }>;
  /**
   * Check if a table needs file path migration
   * @param tableId The table ID to check
   * @returns True if migration is needed
   */
  needsTableFilePathMigration(tableId: string): Promise<boolean>;
  /**
   * Fix orphan __title columns in a table that don't have corresponding link fields
   * This can happen when link fields were deleted incorrectly in older versions
   * @param tableId The table ID to fix
   * @returns Object with arrays of fixed columns and any errors
   */
  fixTableSchema(tableId: string): Promise<{
    fixed: string[];
    errors: string[];
  }>;
  /**
   * Check if a table has orphan __title columns that need fixing
   * @param tableId The table ID to check
   * @returns True if there are orphan columns that need fixing
   */
  needsTableSchemaFix(tableId: string): Promise<boolean>;
}
//# sourceMappingURL=table.d.ts.map
//#endregion
//#region data-space/index.d.ts
declare class DataSpace extends DataSpaceWithTable {
  /**
   * Graft (version control sync) API namespace
   */
  get graft(): {
    pull: () => Promise<Record<string, any>>;
    push: () => Promise<Record<string, any>>;
    fetch: () => Promise<Record<string, any>>;
    clone: (remoteLogId?: string) => Promise<Record<string, any>>;
    status: () => Promise<Record<string, any>>;
    tags: () => Promise<Record<string, any>>;
    volumes: () => Promise<Record<string, any>>;
    info: () => Promise<Record<string, any>>;
    audit: () => Promise<Record<string, any>>;
    hydrate: () => Promise<Record<string, any>>;
  };
}
//#endregion
//#region index.d.ts
interface EidosTable<T = Record<string, string>> {
  id: string;
  name: string;
  fieldsMap: T;
}
/**
 * eidos is the entry of the sdk
 *
 * `eidos.currentSpace.table("tableId").findMany()`
 */
interface Eidos {
  /**
   * Simplified accessor for currentSpace
   */
  space: DataSpace;
  currentSpace: DataSpace;
  /**
   * Script functionality
   */
  script: {
    /**
     * Call a specific script
     * @param scriptId The script ID
     * @param args Arguments to pass to the script
     * @returns The result of the script execution
     */
    call(scriptId: string, ...args: any[]): Promise<any>;
  };
  /**
   * AI-related functionality
   */
  AI: {
    /**
     * Generate text using AI
     * @param options Generation options including model and prompt
     * @param options.model The AI model to use
     * @param options.prompt The prompt text
     * @returns The generated text
     */
    generateText(options: {
      model?: string;
      prompt: string;
      [key: string]: any;
    }): Promise<string>;
    /**
     * Generate object using AI
     * @param options Generation options including model and prompt
     * @param options.model The AI model to use
     * @param options.prompt The prompt text
     * @param options.schema The json schema of the object
     * @returns The generated object
     */
    generateObject(options: {
      model?: string;
      prompt: string;
      schema: Record<string, any>;
      [key: string]: any;
    }): Promise<Record<string, any>>;
  };
  utils: {
    /**
     * we can't use fetch directly in the iframe, so we need to use this method to fetch resource
     * Note: it return Blob, not Response
     *
     * for example:
     *
     * const blob = await eidos.fetchBlob("https://example.com/file.zip", {
     *   method: "GET",
     *   headers: {
     *     "Content-Type": "application/zip",
     *   },
     * })
     *
     * @param url
     * @param options
     * @returns
     */
    fetchBlob(url: string, options: RequestInit): Promise<Blob>;
    /**
     * highlight the row if it is in the current view
     * @param tableId
     * @param rowId
     * @param fieldId
     */
    tableHighlightRow(tableId: string, rowId: string, fieldId?: string): void;
  };
}
//# sourceMappingURL=index.d.ts.map

//#endregion
export { DataSpace, Eidos, EidosTable, FieldType };
//# sourceMappingURL=index.d.ts.map