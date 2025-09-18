import { Message } from "ai";
import * as postal_mime10 from "postal-mime";
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
  type: FieldType;
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
type ViewType = ViewTypeEnum | `ext__${string}`;
interface IView<T = any> {
  id: string;
  name: string;
  type: ViewTypeEnum | `ext__${string}`;
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
//#region sdk/index-manager.d.ts
declare class IndexManager {
  private table;
  dataSpace: DataSpace;
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
  [key: string]: 'asc' | 'desc' | undefined;
}
//#endregion
//#region sdk/rows.d.ts
declare class RowsManager {
  private table;
  dataSpace: DataSpace;
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
  count(options?: Omit<FindManyOptions<Record<string, any>>, 'select' | 'orderBy' | 'skip' | 'take'>): Promise<number>;
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
  Reset = "Reset",
  Pages = "Pages",
  Error = "Error",
  QueryResp = "QueryResp",
  Notify = "Notify",
  BlockUIMsg = "BlockUIMsg",
  DataUpdateSignal = "DataUpdateSignal",
  WebSocketConnected = "WebSocketConnected",
  WebSocketDisconnected = "WebSocketDisconnected",
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
declare abstract class BaseServerDatabase {
  filename?: string;
  get isWalMode(): boolean;
  pages(): Promise<{
    [key: string]: any;
  }>;
  status(): Promise<{
    [key: string]: any;
  }>;
  pull(): Promise<{
    [key: string]: any;
  }>;
  push(): Promise<{
    [key: string]: any;
  }>;
  reset(): Promise<{
    [key: string]: any;
  }>;
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
  }): any;
}
//# sourceMappingURL=interface.d.ts.map
//#endregion
//#region sdk/service/link.d.ts
interface IRelation {
  self: string;
  ref: string;
  link_field_id: string;
}
declare class LinkFieldService {
  private table;
  dataSpace: DataSpace;
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
  dataSpace: DataSpace;
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
  dataSpace: DataSpace;
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
  dataSpace: DataSpace;
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
  dataSpace: DataSpace;
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
  dataSpace: DataSpace;
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
  constructor(dataSpace: DataSpace);
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
  dataSpace: DataSpace;
  rawTableName: string;
  db: EidosDatabase;
  constructor(id: string, dataSpace: DataSpace);
  get compute(): ComputeService;
  get rows(): RowsManager;
  get fields(): FieldsManager;
  get index(): IndexManager;
  isExist(id: string): Promise<boolean>;
  get(id: string): Promise<ITable | null>;
  del(id: string): Promise<boolean>;
  hasSystemColumn(tableId: string, column: string): Promise<any>;
  fixTable(tableId: string): Promise<void>;
  static generateCreateTableSql(fields: Array<{
    name: string;
    type: FieldType;
  }>): {
    tableId: string;
    createTableSql: string;
  };
}
//#endregion
//#region ../lib/storage/eidos-file-system.d.ts
declare enum FileSystemType {
  OPFS = "opfs",
  NFS = "nfs",
}
/**
 * eidos fs structure:
 * - spaces
 *  - space1
 *    - db.sqlite3
 *    - files
 *      - 1234567890.png
 *      - 0987654321.png
 *  - space2
 *    - db.sqlite3
 *
 * spaces
 * - what is a space? a space is a folder that contains a sqlite3 database, default name is db.sqlite3.
 * - one space is one database.
 *
 * files
 * - files is a folder that contains all static files, such as images, videos, etc.
 * - when user upload a file, it will be saved in this folder. hash will be used as file name. e.g. 1234567890.png
 */
declare class EidosFileSystemManager {
  rootDirHandle: FileSystemDirectoryHandle | undefined;
  constructor(rootDirHandle?: FileSystemDirectoryHandle);
  isSameEntry: (dirHandle: FileSystemDirectoryHandle) => Promise<boolean | undefined>;
  getDirHandle: (paths: string[]) => Promise<FileSystemDirectoryHandle>;
  walk: (_paths: string[]) => Promise<string[][]>;
  copyFile: (_paths: string[], targetFs: EidosFileSystemManager) => Promise<void>;
  copyTo: (targetFs: EidosFileSystemManager, options?: {
    ignoreSqlite?: boolean;
  }, cb?: (data: {
    current: number;
    total: number;
    msg: string;
  }) => void) => Promise<void>;
  getFileUrlByPath: (path: string, replaceSpace?: string) => string;
  getFileByURL: (url: string) => Promise<File>;
  getFileByPath: (path: string) => Promise<File>;
  listDir: (_paths: string[]) => Promise<FileSystemFileHandle[]>;
  updateOrCreateDocFile: (_paths: string[], content: string) => Promise<void>;
  checkFileExists: (_paths: string[]) => Promise<boolean>;
  getFile: (_paths: string[], options?: FileSystemGetFileOptions) => Promise<File>;
  getFileText: (_paths: string[]) => Promise<string>;
  getDocContent: (_paths: string[]) => Promise<string>;
  addDir: (_paths: string[], dirName: string) => Promise<void>;
  addFile: (_paths: string[], file: File, fileId?: string) => Promise<string[] | null>;
  deleteEntry: (_paths: string[], isDir?: boolean) => Promise<void>;
  renameFile: (_paths: string[], newName: string) => Promise<void>;
}
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
  count(options?: Omit<FindManyOptions<T>, 'select' | 'orderBy' | 'skip' | 'take'>): Promise<number>;
}
//# sourceMappingURL=base.d.ts.map
//#endregion
//#region meta-table/file.d.ts
interface IFile {
  id: string;
  name: string;
  path: string;
  size: number;
  mime: string;
  created_at?: string;
  is_vectorized?: boolean;
}
declare class FileTable extends BaseTableImpl implements BaseTable<IFile> {
  name: string;
  createTableSql: string;
  /**
   * save file to efs
   * @param url a url of file
   * @param subDir sub directory of file, default is [], which means save file to spaces/\<space\>/files/, if subDir is ["a","b"], then save file to spaces/\<space\>/files/a/b/
   * @param _name file name, default is null, which means use the file name in url
   * @returns
   */
  saveFile2EFS(url: string, subDir: string[], _name?: string): Promise<IFile | null>;
  add(data: IFile): Promise<IFile>;
  getFileByPath(path: string): Promise<IFile | null>;
  deleteFileByPathPrefix(prefix: string): Promise<boolean>;
  updateVectorized(id: string, is_vectorized: boolean): Promise<boolean>;
  get(id: string): Promise<IFile | null>;
  del(id: string): Promise<boolean>;
  /**
   * get blob url of file
   * in script or extension environment we can't access opfs file directly, so we need to use blob url to access it.
   * @param id file id
   * @returns
   */
  getBlobURL(id: string): Promise<string | null>;
  getBlobURLbyPath(path: string): Promise<string | null>;
  getBlobByPath(path: string): Promise<Blob>;
  walk(): Promise<any[]>;
  transformFileSystem(sourceFs: FileSystemType, targetFs: FileSystemType): Promise<void>;
  uploadDir(dirHandle: FileSystemDirectoryHandle, total: number, current: number, _parentPath?: string[]): Promise<void>;
  /**
   * Upload a file to EFS with specified parent path
   * @param fileData File data as ArrayBuffer or base64 string
   * @param fileName Original file name
   * @param mimeType File mime type
   * @param parentPath Parent path array, defaults to ["spaces", <space>, "files"]
   * @returns Uploaded file info
   */
  upload(fileData: ArrayBuffer | string,
  // ArrayBuffer or base64 string
  fileName: string, mimeType: string, parentPath?: string[]): Promise<IFile & {
    publicUrl: string;
  }>;
}
//# sourceMappingURL=file.d.ts.map
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
  dropFTS(tableName: string): Promise<void>;
  hasFTS(tableName: string): Promise<boolean>;
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
    method?: 'L2' | 'COSINE';
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
//#region meta-table/action.d.ts
type ParamType = "string" | "number" | "boolean";
interface IFunction {
  name: string;
  params: {
    name: string;
    value: any;
  }[];
}
interface IAction {
  id: string;
  name: string;
  params: {
    name: string;
    type: ParamType;
  }[];
  nodes: IFunction[];
}
declare class ActionTable extends BaseTableImpl implements BaseTable<IAction> {
  name: string;
  createTableSql: string;
  JSONFields: string[];
  add(data: IAction): Promise<IAction>;
  set(id: string, data: IAction): Promise<boolean>;
  del(id: string): Promise<boolean>;
}
//#endregion
//#region meta-table/message.d.ts
type ChatMessage = {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  parts: Message['parts'];
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
  getChatById(chatId: string): Promise<Chat & {
    messages: ChatMessage[];
  } | null>;
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
  static getColumnTypeByFieldType(type: FieldType): any;
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
    type: FieldType;
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
  createFTSSql: string;
  createTableSql: string;
}
//# sourceMappingURL=base.d.ts.map
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
  type: TreeNodeType | `ext__${string}` | 'day' | 'table' | 'doc' | 'folder' | 'dataview';
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
//#region meta-table/doc/index.d.ts
declare const ComposedDocTable: {
  new (...args: any[]): {
    callMain: (type: MsgType.GetDocMarkdown | MsgType.ConvertMarkdown2State | MsgType.ConvertHtml2State | MsgType.ConvertEmail2State, data: any) => Promise<any> | undefined;
    listAllDayPages(): Promise<any>;
    listDayPage(page?: number): Promise<any>;
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
      text: string | postal_mime10.Email;
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
    createFTSSql: string;
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
      recreateFtsTable?: boolean;
    }): Promise<void>;
    search(query: string, options?: {
      allowAdvanced?: boolean;
    } | undefined): Promise<{
      id: string;
      result: string;
    }[]>;
    name: string;
    createFTSSql: string;
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
    createFTSSql: string;
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
type ExtensionMeta = TableViewMeta | ExtNodeMeta | ToolMeta | TableActionMeta | DocActionMeta | UDFMeta;
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
  Tool = "tool",
  UDF = "udf",
}
declare enum BlockExtensionType {
  TableView = "tableView",
  ExtNode = "extNode",
}
interface TableViewMeta {
  type: BlockExtensionType.TableView;
  componentName: string;
  tableView: {
    title: string;
    type: string;
    description: string;
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
interface UDFMeta {
  type: ScriptExtensionType.UDF;
  funcName: string;
  udf: {
    name: string;
    deterministic?: boolean;
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
  enable(id: string): Promise<boolean>;
  disable(id: string): Promise<boolean>;
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
   * Override add method to ensure slug uniqueness
   */
  add(data: Partial<IExtension>, db?: BaseServerDatabase): Promise<IExtension>;
  /**
   * Fix duplicate slugs in existing extensions
   * This method should be called during migration to ensure all existing extensions have unique slugs
   */
  fixDuplicateSlugs(): Promise<void>;
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
  metadata: Record<string, any>;
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
    metadata: Record<string, any>;
  }): Promise<void>;
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
//#region meta-table/tree.d.ts
declare class TreeTable extends BaseTableImpl implements BaseTable<ITreeNode> {
  name: string;
  createTableSql: string;
  getNextRowId: () => Promise<any>;
  add(data: ITreeNode): Promise<ITreeNode>;
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
  checkLoop(id: string, parentId: string): Promise<void>;
  private getAdjacencyList;
  private dfs;
  getPosition(props: {
    parentId?: string;
    targetId: string;
    targetDirection: "up" | "down";
  }): Promise<number>;
  listNodes(query?: string, withSubNode?: boolean): Promise<ITreeNode[]>;
  updateNodePosition(id: string, position: number): Promise<boolean>;
  pinNode(id: string, isPinned: boolean): Promise<boolean>;
  toggleNodeFullWidth(id: string, isFullWidth: boolean): Promise<boolean>;
  toggleNodeLock(id: string, isLocked: boolean): Promise<boolean>;
  updateNodeName(id: string, name: string): Promise<void>;
  addNode(data: ITreeNode): Promise<ITreeNode>;
  getOrCreateNode(data: ITreeNode): Promise<ITreeNode>;
  nodeChangeParent(id: string, parentId?: string, opts?: {
    targetId: string;
    targetDirection: "up" | "down";
  }): Promise<Partial<ITreeNode>>;
  restoreNode(id: string): Promise<boolean>;
  deleteNode(id: string): Promise<boolean>;
  createExtNode(ext_node_type: string, parent_id?: string): Promise<string>;
  permanentlyDeleteExtNode(nodeId: string): Promise<void>;
}
//# sourceMappingURL=tree.d.ts.map
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
  delete(id: string): Promise<void>;
  isDataViewExist(id: string): Promise<boolean>;
  getViewRawQuery(tableName: string): Promise<any>;
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
}
//# sourceMappingURL=sql-data-view.d.ts.map
//#endregion
//#region sdk/theme-manager.d.ts
declare class ThemeManager {
  private dataSpace;
  constructor(dataSpace: DataSpace);
  getTheme(name: string): Promise<any>;
  setTheme(name: string, css: string): Promise<void>;
  listThemes(): Promise<any>;
  applyTheme(name: string, css: string): Promise<void>;
  setCurrentTheme(name: string): Promise<void>;
}
//# sourceMappingURL=theme-manager.d.ts.map

//#endregion
//#region DataSpace/base.d.ts
type EidosDatabase = BaseServerDatabase;
declare abstract class BaseDataSpace {
  db: EidosDatabase;
  draftDb: BaseDataSpace | undefined;
  undoRedoManager: SQLiteUndoRedo;
  activeUndoManager: boolean;
  dbName: string;
  doc: DocTable;
  action: ActionTable;
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
  hasLoadExtension: boolean;
  postMessage?: (data: any, transfer?: any[]) => void;
  callRenderer?: (type: any, data: any) => Promise<any>;
  dataEventChannel: BroadcastChannel;
  eventHandler: DataChangeEventHandler;
  efsManager?: EidosFileSystemManager;
  hasMigrated: boolean;
  tableFullTextSearch: TableFullTextSearch;
  tableSemanticSearch: TableSemanticSearch;
  isUDFWithCtx: boolean;
  context: {
    setInterval?: typeof setInterval;
    embedding?: (text: string) => Promise<Array<number>>;
  };
  constructor(config: {
    db: EidosDatabase;
    activeUndoManager: boolean;
    dbName: string;
    context: {
      setInterval?: typeof setInterval;
      embedding?: (text: string) => Promise<Array<number>>;
    };
    hasLoadExtension?: boolean;
    createUDF?: (db: EidosDatabase) => void;
    draftDb?: BaseDataSpace;
    postMessage?: (data: any, transfer?: any[]) => void;
    callRenderer?: (type: any, data: any) => Promise<any>;
    efsManager?: EidosFileSystemManager;
    dataEventChannel: BroadcastChannel;
    cacheSize?: number;
    isUDFWithCtx?: boolean;
    enableFTS?: boolean;
  });
  getSpaceName(): Promise<string>;
  protected setCacheSize(size: number): void;
  protected initUDF(): void;
  protected initMetaTable(): void;
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
  notify(msg: {
    title: string;
    description: string;
  }): void;
  blockUIMsg(msg: string | null, data?: Record<string, any>): void;
}
//# sourceMappingURL=base.d.ts.map
//#endregion
//#region DataSpace/db.d.ts
declare class DataSpaceWithDatabase extends BaseDataSpace {
  status(): Promise<{
    [key: string]: any;
  }>;
  pages(): Promise<{
    [key: string]: any;
  }>;
  pull(): Promise<{
    [key: string]: any;
  }>;
  reset(): Promise<{
    [key: string]: any;
  }>;
  close(): void;
  syncExec2(sql: string, bind?: any[], db?: BaseServerDatabase): Promise<any>;
  exec2(sql: string, bind?: any[]): Promise<any>;
  execute(sql: string, bind?: any[]): Promise<{
    fetchone: () => any;
    fetchall: () => any[];
  }>;
  exec(sql: string, bind?: any[]): void;
  protected execSqlWithBind(sql: string, bind?: any[], rowMode?: "object" | "array"): Promise<any[]>;
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
//#region DataSpace/file.d.ts
declare class DataSpaceWithFile extends DataSpaceWithDatabase {
  addFile(file: IFile): Promise<IFile>;
  uploadDir(dirHandle: FileSystemDirectoryHandle, _parentPath?: string[]): Promise<void>;
  getFileById(id: string): Promise<IFile | null>;
  getFileByPath(path: string): Promise<IFile | null>;
  delFile(id: string): Promise<boolean>;
  delFileByPath(path: string): Promise<boolean | undefined>;
  deleteFileByPathPrefix(prefix: string): Promise<boolean>;
  updateFileVectorized(id: string, isVectorized: boolean): Promise<boolean>;
  saveFile2EFS(url: string, subDir?: string[], name?: string): Promise<IFile | null>;
  listFiles(): Promise<any[]>;
  walkFiles(): Promise<any[]>;
  transformFileSystem(sourceFs: FileSystemType, targetFs: FileSystemType): Promise<void>;
}
//# sourceMappingURL=file.d.ts.map
//#endregion
//#region DataSpace/doc.d.ts
declare class DataSpaceWithDoc extends DataSpaceWithFile {
  addDoc(docId: string, content: string, markdown: string, isDayPage?: boolean): Promise<void>;
  updateDoc(docId: string, content: string, markdown: string, _isDayPage?: boolean): Promise<void>;
  getDoc(docId: string): Promise<any>;
  getDocMarkdown(docId: string, {
    withTitle
  }?: {
    withTitle?: boolean;
  }): Promise<any>;
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
  fullTextSearch(query: string): Promise<{
    id: string;
    result: string;
  }[]>;
  listDays(page: number): Promise<any>;
  listAllDays(): Promise<any>;
}
//# sourceMappingURL=doc.d.ts.map
//#endregion
//#region DataSpace/table.d.ts
declare class DataSpaceWithTable extends DataSpaceWithDoc {
  table(id: string): TableManager;
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
}
//# sourceMappingURL=table.d.ts.map
//#endregion
//#region DataSpace/index.d.ts
declare class DataSpace extends DataSpaceWithTable {}
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
 * `eidos.currentSpace.table("tableId").rows.query()`
 */
interface Eidos {
  space(spaceName: string): DataSpace;
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
export { DataSpace, Eidos, EidosTable };
//# sourceMappingURL=index.d.ts.map