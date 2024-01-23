declare module "lib/const" {
    export enum MsgType {
        SetConfig = "SetConfig",
        CallFunction = "CallFunction",
        SwitchDatabase = "SwitchDatabase",
        CreateSpace = "CreateSpace",
        Syscall = "Syscall",
        Error = "Error",
        QueryResp = "QueryResp",
        Notify = "Notify",
        DataUpdateSignal = "DataUpdateSignal",
        WebSocketConnected = "WebSocketConnected",
        WebSocketDisconnected = "WebSocketDisconnected",
        ConvertMarkdown2State = "ConvertMarkdown2State",
        GetDocMarkdown = "GetDocMarkdown"
    }
    export enum MainServiceWorkerMsgType {
        SetData = "SetData"
    }
    export enum EidosDataEventChannelMsgType {
        DataUpdateSignalType = "DataUpdateSignalType"
    }
    export enum DataUpdateSignalType {
        Update = "update",
        Insert = "insert",
        Delete = "delete",
        AddColumn = "addColumn",
        UpdateColumn = "updateColumn"
    }
    export const EidosDataEventChannelName = "eidos-data-event";
    export const EidosSharedEnvChannelName = "eidos-shared-env";
}
declare module "lib/log" {
    export const logger: Console;
    export const EIDOS_VERSION = "0.4.3";
    export const isDevMode: boolean;
}
declare module "lib/sqlite/const" {
    /**
     * define constance what we will use in sqlite
     */
    export const TreeTableName = "eidos__tree";
    export const ColumnTableName = "eidos__columns";
    export const TodoTableName = "eidos__todo";
    export const FileTableName = "eidos__files";
    export const DocTableName = "eidos__docs";
    export const ActionTableName = "eidos__actions";
    export const ScriptTableName = "eidos__scripts";
    export const ViewTableName = "eidos__views";
    export const EmbeddingTableName = "eidos__embeddings";
}
declare module "lib/sqlite/helper" {
    export const getTransformedQuery: (query: string) => any;
    export function isReadOnlySql(sql: string): boolean;
    /**
     *
     * example 1:
     *
     * const id = 42
     * const fieldName = "id"
     * buildSql`select ${Symbol(fieldName)} from table where id = ${id}` => { sql: "select id from table where id = ?", bind: [42]}
     *
     * example 2:
     * const table = "books"
     * buildSql`select * from ${Symbol(table)}` => { sql: "select * from books", bind: []}
     *
     * buildSql only return sql and bind, no execute.we need to escape table name, column name, etc.
     *
     * in example 1, we can use ? placeholder to avoid sql injection
     * in example 2, we need to escape table name, column name, etc.
     *
     * if variable is a Symbol, we don't escape it.
     * @param strings
     * @param values
     * @returns
     */
    export function buildSql(strings: TemplateStringsArray, ...values: any[]): {
        sql: string;
        bind: any[];
    };
    export const checkSqlIsModifyTableSchema: (sql: string) => boolean;
    export const checkSqlIsOnlyQuery: (sql: string) => boolean;
    export const checkSqlIsModifyTableData: (sql: string) => boolean;
    export function isAggregated(sql: string): boolean;
    export const aggregateSql2columns: (sql: string, originFields: string[]) => any;
    export const getSqlQueryColumns: (sql: string, originSchema: any) => any;
    export const queryData2JSON: (sqlResult: any[][], fields: string[]) => any[];
    export const stringify: (obj: any) => any;
}
declare module "lib/fields/const" {
    export enum FieldType {
        Number = "number",
        Text = "text",
        Title = "title",
        Checkbox = "checkbox",
        Date = "date",
        File = "file",
        MultiSelect = "multi-select",
        Rating = "rating",
        Select = "select",
        URL = "url",
        Formula = "formula",
        Link = "link",
        CreatedTime = "created-time",
        CreatedBy = "created-by",
        LastEditedTime = "last-edited-time",
        LastEditedBy = "last-edited-by"
    }
    export enum GridCellKind {
        Uri = "uri",
        Text = "text",
        Image = "image",
        RowID = "row-id",
        Number = "number",
        Bubble = "bubble",
        Boolean = "boolean",
        Loading = "loading",
        Markdown = "markdown",
        Drilldown = "drilldown",
        Protected = "protected",
        Custom = "custom"
    }
    export enum CompareOperator {
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
        LessThanOrEqual = "<="
    }
    export enum BinaryOperator {
        And = "AND",
        Or = "OR"
    }
    export const NUMBER_BASED_COMPARE_OPERATORS: CompareOperator[];
    export const TEXT_BASED_COMPARE_OPERATORS: CompareOperator[];
    export function applyMixins(derivedCtor: any, constructors: any[]): void;
}
declare module "lib/store/ITreeNode" {
    export interface ITreeNode {
        id: string;
        name: string;
        type: "table" | "doc";
        parentId?: string;
        isPinned?: boolean;
        icon?: string;
        cover?: string;
    }
}
declare module "components/table/view-filter-editor/interface" {
    import { BinaryOperator, CompareOperator } from "lib/fields/const";
    export interface IFilterValue {
        operator: CompareOperator;
        operands: [
            field: string,
            value: string | number | boolean | Date | null | undefined
        ];
    }
    export interface IGroupFilterValue {
        operator: BinaryOperator;
        operands: (IFilterValue | IGroupFilterValue)[];
    }
    export type FilterValueType = IFilterValue | IGroupFilterValue;
}
declare module "lib/store/IView" {
    import { FilterValueType } from "components/table/view-filter-editor/interface";
    export enum ViewTypeEnum {
        Grid = "grid",
        Gallery = "gallery"
    }
    export interface IView<T = any> {
        id: string;
        name: string;
        type: ViewTypeEnum;
        tableId: string;
        query: string;
        fieldIds?: string[];
        properties?: T;
        filter?: FilterValueType;
        orderMap?: Record<string, number>;
        hiddenFields?: string[];
    }
    export interface IGridViewProperties {
        fieldWidthMap: Record<string, number>;
    }
}
declare module "lib/store/interface" {
    import { FieldType } from "lib/fields/const";
    import { ITreeNode } from "lib/store/ITreeNode";
    import { IView } from "lib/store/IView";
    export type IField<T = any> = {
        name: string;
        type: FieldType;
        table_column_name: string;
        table_name: string;
        property: T;
    };
    export interface ITable {
        rowMap: {
            [rowId: string]: Record<string, any>;
        };
        fieldMap: {
            [fieldId: string]: IField;
        };
        viewMap: {
            [viewId: string]: IView;
        };
        viewIds: string[];
    }
    export interface IDataStore {
        tableMap: {
            [nodeId: string]: ITable;
        };
        nodeIds: string[];
        nodeMap: {
            [nodeId: string]: ITreeNode;
        };
    }
}
declare module "lib/utils" {
    import { type ClassValue } from "clsx";
    export { v4 as uuidv4 } from "uuid";
    export function nonNullable<T>(value: T): value is NonNullable<T>;
    export function cn(...inputs: ClassValue[]): any;
    export const hashText: (text: string) => number;
    export const checkIsInWorker: () => boolean;
    /**
     * pathname = /space1/5c5bf8539ee9434aa721560c89f34ed6
     * databaseName = space1
     * tableId = 5c5bf8539ee9434aa721560c89f34ed6
     * tableName = user custom name
     * rawTableName = tb_5c5bf8539ee9434aa721560c89f34ed6 (real table name in sqlite)
     * @param id
     * @returns
     */
    export const getRawTableNameById: (id: string) => string;
    export const getTableIdByRawTableName: (rawTableName: string) => string;
    export const generateColumnName: () => string;
    export const getRawDocNameById: (id: string) => string;
    export const shortenId: (id: string) => string;
    export const extractIdFromShortId: (shortId: string) => string;
    export const getToday: () => string;
    export const getLocalDate: (date: Date) => string;
    export const getUuid: () => string;
    export const generateId: () => string;
    export const isDayPage: (id: string) => boolean;
    export function timeAgo(date: Date): string;
}
declare module "lib/sqlite/sql-formula-parser" {
    import { IField } from "lib/store/interface";
    /**
     * example:
     * sql: select * from table1
     * fields: [{name: "id", type: "number"}, {name: "name", type: "string"}]
     * return: select id, name from table1
     *
     * example2:
     * sql: select id,name from table1
     * fields: [{name: "id", type: "number","table_column_name": "cl_xxx1"}, {name: "name", type: "string"},"table_column_name": "cl_xxx2"]
     * return: select cl_xxx1 as id, cl_xxx2 as name from table1
     * @param sql
     * @param fields
     */
    export const transformQuery: (sql: string, fields: IField[]) => any;
    export const transformFormula2VirtualGeneratedField: (columnName: string, fields: IField[]) => any;
    export const transformQueryWithFormulaFields2Sql: (query: string, fields: IField[]) => any;
}
declare module "lib/opfs" {
    export const getAllSpaceNames: () => Promise<string[]>;
    export class OpfsSpaceManager {
        list(): Promise<string[]>;
        remove(spaceName: string): Promise<void>;
    }
    export const getSpaceDatabasePath: (spaceName: string) => Promise<string>;
    export const getSpaceDatabaseFileHandle: (spaceName: string) => Promise<FileSystemFileHandle>;
    export const saveFile: (file: File, space: string, name?: string) => Promise<FileSystemFileHandle>;
    export const getAllDays: (spaceName: string) => Promise<any[]>;
    export const getDirHandle: (_paths: string[], rootDirHandle?: FileSystemDirectoryHandle) => Promise<FileSystemDirectoryHandle>;
    export class OpfsManager {
        rootDirHandle: FileSystemDirectoryHandle | undefined;
        constructor(rootDirHandle?: FileSystemDirectoryHandle);
        walk: (_paths: string[]) => Promise<any[]>;
        getFileUrlByPath: (path: string, replaceSpace?: string) => string;
        getFileByURL: (url: string) => Promise<File>;
        getFileByPath: (path: string) => Promise<File>;
        listDir: (_paths: string[]) => Promise<FileSystemFileHandle[]>;
        updateOrCreateDocFile: (_paths: string[], content: string) => Promise<void>;
        getFile: (_paths: string[]) => Promise<File>;
        getDocContent: (_paths: string[]) => Promise<string>;
        addDir: (_paths: string[], dirName: string) => Promise<void>;
        addFile: (_paths: string[], file: File, fileId?: string) => Promise<string[]>;
        deleteEntry: (_paths: string[], isDir?: boolean) => Promise<void>;
        renameFile: (_paths: string[], newName: string) => Promise<void>;
    }
    export const opfsManager: OpfsManager;
}
declare module "worker/web-worker/DbMigrator" {
    import { DataSpace } from "worker/web-worker/DataSpace";
    /**
     * auto migrate db schema when db schema changed
     */
    export class DbMigrator {
        private db;
        private draftDb;
        private allowDeletions;
        constructor(db: DataSpace, draftDb: DataSpace, allowDeletions?: boolean);
        private compareTables;
        private compareColumns;
        private migrateTables;
        private migrateTable;
        migrate(): void;
    }
}
declare module "worker/web-worker/meta_table/base" {
    import { DataSpace } from "worker/web-worker/DataSpace";
    export interface MetaTable<T> {
        add(data: T): Promise<T>;
        get(id: string): Promise<T | null>;
        set(id: string, data: Partial<T>): Promise<boolean>;
        del(id: string): Promise<boolean>;
    }
    export interface BaseTable<T> extends MetaTable<T> {
        name: string;
        createTableSql: string;
        JSONFields?: string[];
    }
    export class BaseTableImpl<T = any> {
        protected dataSpace: DataSpace;
        name: string;
        JSONFields: string[];
        constructor(dataSpace: DataSpace);
        initTable(createTableSql: string): void;
        set(id: string, data: Partial<T>): Promise<boolean>;
        list(query?: Record<string, any>): Promise<T[]>;
    }
}
declare module "worker/web-worker/meta_table/action" {
    import { BaseTable, BaseTableImpl } from "worker/web-worker/meta_table/base";
    type ParamType = "string" | "number" | "boolean";
    interface IFunction {
        name: string;
        params: {
            name: string;
            value: any;
        }[];
    }
    export interface IAction {
        id: string;
        name: string;
        params: {
            name: string;
            type: ParamType;
        }[];
        nodes: IFunction[];
    }
    export class ActionTable extends BaseTableImpl implements BaseTable<IAction> {
        name: string;
        createTableSql: string;
        JSONFields: string[];
        add(data: IAction): Promise<IAction>;
        set(id: string, data: IAction): Promise<boolean>;
        del(id: string): Promise<boolean>;
        get(id: string): Promise<any>;
    }
}
declare module "worker/web-worker/meta_table/column" {
    import { IField } from "lib/store/interface";
    import { BaseTable, BaseTableImpl } from "worker/web-worker/meta_table/base";
    export class ColumnTable extends BaseTableImpl implements BaseTable<IField> {
        name: string;
        createTableSql: string;
        JSONFields: string[];
        add(data: IField): Promise<IField>;
        get(id: string): Promise<IField | null>;
        set(id: string, data: Partial<IField>): Promise<boolean>;
        del(id: string): Promise<boolean>;
        deleteField(tableName: string, tableColumnName: string): Promise<void>;
        /**
         * @param tableName tb_<uuid>
         */
        deleteByRawTableName(tableName: string): Promise<void>;
        updateProperty(data: {
            tableName: string;
            tableColumnName: string;
            property: any;
            isFormula?: boolean;
        }): Promise<void>;
        list(q: {
            table_name: string;
        }): Promise<IField[]>;
    }
}
declare module "worker/web-worker/meta_table/doc" {
    import { BaseTable, BaseTableImpl } from "worker/web-worker/meta_table/base";
    interface IDoc {
        id: string;
        content: string;
        markdown: string;
        isDayPage?: boolean;
    }
    export class DocTable extends BaseTableImpl implements BaseTable<IDoc> {
        name: string;
        createTableSql: string;
        rebuildIndex(refillNullMarkdown?: boolean): Promise<void>;
        listAllDayPages(): Promise<{
            id: any;
            content: any;
        }[]>;
        listDayPage(page?: number): Promise<{
            id: any;
        }[]>;
        add(data: IDoc): Promise<IDoc>;
        get(id: string): Promise<{
            id: string;
            title: any;
            content: any;
            markdown: any;
        }>;
        set(id: string, data: IDoc): Promise<boolean>;
        del(id: string): Promise<boolean>;
        getMarkdown(id: string): Promise<unknown>;
        search(query: string): Promise<{
            id: string;
            result: string;
        }[]>;
        createOrUpdateWithMarkdown(id: string, mdStr: string): Promise<{
            id: string;
            success: boolean;
            msg?: undefined;
        } | {
            id: string;
            success: boolean;
            msg: string;
        }>;
    }
}
declare module "worker/web-worker/meta_table/embedding" {
    import { BaseTable, BaseTableImpl } from "worker/web-worker/meta_table/base";
    export interface IEmbedding {
        id: string;
        embedding: string;
        model: string;
        rawContent: string;
        sourceType: "doc" | "table" | "file";
        source: string;
    }
    export class EmbeddingTable extends BaseTableImpl implements BaseTable<IEmbedding> {
        name: string;
        createTableSql: string;
        add(data: IEmbedding): Promise<IEmbedding>;
        get(id: string): Promise<IEmbedding | null>;
        set(id: string, data: Partial<IEmbedding>): Promise<boolean>;
        del(id: string): Promise<boolean>;
    }
}
declare module "worker/web-worker/meta_table/file" {
    import { BaseTable, BaseTableImpl } from "worker/web-worker/meta_table/base";
    export interface IFile {
        id: string;
        name: string;
        path: string;
        size: number;
        mime: string;
        isVectorized?: boolean;
    }
    export class FileTable extends BaseTableImpl implements BaseTable<IFile> {
        name: string;
        createTableSql: string;
        saveFile2OPFS(url: string, _name?: string): Promise<IFile | null>;
        add(data: IFile): Promise<IFile>;
        getFileByPath(path: string): Promise<IFile | null>;
        deleteFileByPathPrefix(prefix: string): Promise<boolean>;
        updateVectorized(id: string, isVectorized: boolean): Promise<boolean>;
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
        walk(): Promise<any[]>;
    }
}
declare module "worker/web-worker/meta_table/script" {
    import { JsonSchema7ObjectType } from "zod-to-json-schema/src/parsers/object";
    import { BaseTable, BaseTableImpl } from "worker/web-worker/meta_table/base";
    export type ScriptStatus = "all" | "enabled" | "disabled";
    export interface ICommand {
        name: string;
        description: string;
        inputJSONSchema?: JsonSchema7ObjectType;
        outputJSONSchema?: JsonSchema7ObjectType;
        asTableAction?: boolean;
    }
    export interface IScript {
        id: string;
        name: string;
        description: string;
        version: string;
        code: string;
        commands: ICommand[];
        enabled?: boolean;
        tables?: {
            name: string;
            fields: {
                name: string;
                type: string;
            }[];
        }[];
        envs?: {
            name: string;
            type: string;
            readonly?: boolean;
        }[];
        envMap?: {
            [key: string]: string;
        };
        fieldsMap?: {
            [tableName: string]: {
                id: string;
                name: string;
                fieldsMap: {
                    [fieldName: string]: string;
                };
            };
        };
    }
    export class ScriptTable extends BaseTableImpl<IScript> implements BaseTable<IScript> {
        name: string;
        createTableSql: string;
        add(data: IScript): Promise<IScript>;
        del(id: string): Promise<boolean>;
        get(id: string): Promise<IScript | null>;
        list(q: {
            status: ScriptStatus;
        }): Promise<IScript[]>;
        enable(id: string): Promise<boolean>;
        disable(id: string): Promise<boolean>;
        updateEnvMap(id: string, envMap: {
            [key: string]: string;
        }): Promise<boolean>;
    }
}
declare module "lib/sqlite/sql-merge-table-with-new-columns" {
    /**
     * sqlite has some limitations on alter table, for example, we can't add a column with default value.
     * when we want to add new columns to a table
     * 1. we need to create a new table with new columns
     * 2. copy data from old table to new table
     * 3. then drop old table
     * 4. rename new table to old table name.
     * @param createTableSql
     * @param newColumnSql
     */
    export function generateMergeTableWithNewColumnsSql(createTableSql: string, newColumnSql: string): {
        newTmpTableSql: any;
        sql: any;
    };
}
declare module "worker/web-worker/meta_table/table" {
    import { IView } from "lib/store/IView";
    import { DataSpace } from "worker/web-worker/DataSpace";
    import { MetaTable } from "worker/web-worker/meta_table/base";
    interface ITable {
        id: string;
        name: string;
        views: IView[];
    }
    export class Table implements MetaTable<ITable> {
        protected dataSpace: DataSpace;
        constructor(dataSpace: DataSpace);
        add(data: ITable): Promise<ITable>;
        isExist(id: string): Promise<boolean>;
        get(id: string): Promise<ITable | null>;
        set(id: string, data: Partial<ITable>): Promise<boolean>;
        del(id: string): Promise<boolean>;
        hasSystemColumn(tableId: string, column: string): Promise<boolean>;
        fixTable(tableId: string): Promise<void>;
    }
}
declare module "worker/web-worker/meta_table/tree" {
    import { ITreeNode } from "lib/store/ITreeNode";
    import { BaseTable, BaseTableImpl } from "worker/web-worker/meta_table/base";
    export class TreeTable extends BaseTableImpl implements BaseTable<ITreeNode> {
        name: string;
        createTableSql: string;
        add(data: ITreeNode): Promise<ITreeNode>;
        get(id: string): Promise<ITreeNode | null>;
        updateName(id: string, name: string): Promise<boolean>;
        pin(id: string, isPinned: boolean): Promise<boolean>;
        del(id: string): Promise<boolean>;
        makeProxyRow(row: any): ITreeNode;
        list(qs: {
            query?: string;
            withSubNode?: boolean;
        }): Promise<ITreeNode[]>;
        moveIntoTable(id: string, tableId: string): Promise<boolean>;
    }
}
declare module "lib/sqlite/sql-parser" {
    import type { IField } from "lib/store/interface";
    export const getColumnsFromQuery: (sql?: string) => any;
    export const replaceQueryTableName: (query: string, tableNameMap: Record<string, string>) => any;
    /**
     * 1. every user-created-table has a `_id` and a `title` column
     * 2. to render a table, first we query data.
     * 2.1 if the table has link fields, we need to join the link table to get the title
     * @param uiColumnMap name -> IUIColumn map of the table
     * @returns
     */
    export const getLinkQuery: (uiColumnMap: Map<string, IField>) => {
        columnName: string;
        sql: string;
    }[];
    /**
     * transform sql query replace column name with columnNameMap
     * @param sql
     * @param columnNameMap
     * @returns transformed sql
     */
    export const transformSql: (sql: string, rawTableName: string, columnNameMap: Map<string, string>) => string;
}
declare module "worker/web-worker/meta_table/view" {
    import { IView } from "lib/store/IView";
    import { BaseTable, BaseTableImpl } from "worker/web-worker/meta_table/base";
    export class ViewTable extends BaseTableImpl implements BaseTable<IView> {
        name: string;
        createTableSql: string;
        JSONFields: string[];
        add(data: IView): Promise<IView>;
        get(id: string): Promise<IView | null>;
        del(id: string): Promise<boolean>;
        deleteByTableId(tableId: string): Promise<void>;
        updateQuery(id: string, query: string): Promise<void>;
        createDefaultView(tableId: string): Promise<IView<any>>;
        isRowExistInQuery(tableId: string, rowId: string, query: string): Promise<boolean>;
        recompute(tableId: string, rowIds: string[]): Promise<any[]>;
    }
}
declare module "worker/web-worker/store" {
    export const workerStore: {
        currentCallUserId: string | null;
    };
}
declare module "worker/web-worker/sdk/table" {
    import { DataSpace } from "worker/web-worker/DataSpace";
    import { RowsManager } from "worker/web-worker/sdk/rows";
    export class TableManager {
        id: string;
        dataSpace: DataSpace;
        rawTableName: string;
        constructor(id: string, dataSpace: DataSpace);
        get rows(): RowsManager;
    }
}
declare module "worker/web-worker/sdk/rows" {
    import type { IField } from "lib/store/interface";
    import { DataSpace } from "worker/web-worker/DataSpace";
    import { TableManager } from "worker/web-worker/sdk/table";
    export class RowsManager {
        private table;
        dataSpace: DataSpace;
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
        get(id: string): Promise<Record<string, any>>;
        /**
         * @param filter a filter object, the key is field name, the value is field value
         * @param options
         * @returns
         */
        query(filter?: Record<string, any>, options?: {
            limit?: number;
            offset?: number;
            raw?: boolean;
        }): Promise<any[]>;
        getCreateData(data: Record<string, any>): Record<string, any>;
        getUpdateData(data: Record<string, any>): {
            _last_edited_by: string;
        };
        create(data: Record<string, any>, options?: {
            useFieldId?: boolean;
        }): Promise<Record<string, any>>;
        delete(id: string): Promise<boolean>;
        update(id: string, data: Record<string, any>, options?: {
            useFieldId?: boolean;
        }): Promise<{
            _last_edited_by: string;
            id: string;
        }>;
    }
}
declare module "worker/web-worker/sql_undo_redo_v2" {
    import { DataSpace } from "worker/web-worker/DataSpace";
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
    export class SQLiteUndoRedo {
        undo: UndoRedoState;
        db: DataSpace;
        constructor(db: DataSpace);
        activate(tables: string[]): void;
        deactivate(): void;
        freeze(): void;
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
}
declare module "worker/web-worker/trigger/data_change_trigger" {
    import { DataSpace } from "worker/web-worker/DataSpace";
    type IRegisterTrigger = {
        update: string;
        insert: string;
        delete: string;
    };
    export class DataChangeTrigger {
        triggerMap: Map<string, IRegisterTrigger>;
        constructor();
        private getRowJSONObj;
        registerTrigger(space: string, tableName: string, trigger: IRegisterTrigger): Promise<void>;
        isTriggerChanged(space: string, tableName: string, trigger: IRegisterTrigger): boolean;
        setTrigger(db: DataSpace, tableName: string, collist: any[], toDeleteColumns?: string[]): Promise<void>;
    }
}
declare module "worker/web-worker/DataSpace" {
    import { Database, Sqlite3Static } from "@sqlite.org/sqlite-wasm";
    import { IField } from "lib/store/interface";
    import { ITreeNode } from "lib/store/ITreeNode";
    import { IView } from "lib/store/IView";
    import { ActionTable } from "worker/web-worker/meta_table/action";
    import { BaseTable } from "worker/web-worker/meta_table/base";
    import { ColumnTable } from "worker/web-worker/meta_table/column";
    import { DocTable } from "worker/web-worker/meta_table/doc";
    import { EmbeddingTable, IEmbedding } from "worker/web-worker/meta_table/embedding";
    import { FileTable, IFile } from "worker/web-worker/meta_table/file";
    import { IScript, ScriptStatus, ScriptTable } from "worker/web-worker/meta_table/script";
    import { Table } from "worker/web-worker/meta_table/table";
    import { TreeTable } from "worker/web-worker/meta_table/tree";
    import { ViewTable } from "worker/web-worker/meta_table/view";
    import { TableManager } from "worker/web-worker/sdk/table";
    import { SQLiteUndoRedo } from "worker/web-worker/sql_undo_redo_v2";
    import { DataChangeTrigger } from "worker/web-worker/trigger/data_change_trigger";
    export type EidosTable = DocTable | ActionTable | ScriptTable | TreeTable | ViewTable | ColumnTable | EmbeddingTable | FileTable;
    export class DataSpace {
        db: Database;
        draftDb: DataSpace | undefined;
        sqlite3: Sqlite3Static;
        undoRedoManager: SQLiteUndoRedo;
        activeUndoManager: boolean;
        dbName: string;
        doc: DocTable;
        action: ActionTable;
        script: ScriptTable;
        tree: TreeTable;
        view: ViewTable;
        column: ColumnTable;
        embedding: EmbeddingTable;
        file: FileTable;
        _table: Table;
        dataChangeTrigger: DataChangeTrigger;
        allTables: BaseTable<any>[];
        hasMigrated: boolean;
        constructor(db: Database, activeUndoManager: boolean, dbName: string, sqlite3: Sqlite3Static, draftDb?: DataSpace);
        closeDb(): void;
        private initUDF;
        private initMetaTable;
        onTableChange(space: string, tableName: string, toDeleteColumns?: string[]): Promise<void>;
        addEmbedding(embedding: IEmbedding): Promise<IEmbedding>;
        table(id: string): TableManager;
        setRow(tableId: string, rowId: string, data: any): Promise<{
            _last_edited_by: string;
            id: string;
        }>;
        setCell(data: {
            tableId: string;
            rowId: string;
            fieldId: string;
            value: any;
        }): Promise<{
            _last_edited_by: string;
            id: string;
        }>;
        getRow(tableId: string, rowId: string): Promise<any>;
        addFile(file: IFile): Promise<IFile>;
        getFileById(id: string): Promise<IFile>;
        getFileByPath(path: string): Promise<IFile>;
        delFile(id: string): Promise<boolean>;
        delFileByPath(path: string): Promise<boolean>;
        deleteFileByPathPrefix(prefix: string): Promise<boolean>;
        updateFileVectorized(id: string, isVectorized: boolean): Promise<boolean>;
        saveFile2OPFS(url: string, name?: string): Promise<IFile>;
        listFiles(): Promise<any[]>;
        walkFiles(): Promise<any[]>;
        listViews(tableId: string): Promise<any[]>;
        addView(view: IView): Promise<IView<any>>;
        delView(viewId: string): Promise<boolean>;
        updateView(viewId: string, view: Partial<IView>): Promise<boolean>;
        createDefaultView(tableId: string): Promise<IView<any>>;
        isRowExistInQuery(tableId: string, rowId: string, query: string): Promise<boolean>;
        getRecomputeRows(tableId: string, rowIds: string[]): Promise<any[]>;
        addColumn(data: IField): Promise<IField>;
        deleteField(tableName: string, tableColumnName: string): Promise<void>;
        listRawColumns(tableName: string): Promise<any>;
        updateColumnProperty(data: {
            tableName: string;
            tableColumnName: string;
            property: any;
            isFormula?: boolean;
        }): Promise<void>;
        addRow(tableName: string, data: Record<string, any>): Promise<Record<string, any>>;
        addAction(data: any): Promise<void>;
        listActions(): Promise<any[]>;
        addScript(data: IScript): Promise<void>;
        listScripts(status?: ScriptStatus): Promise<IScript[]>;
        getScript(id: string): Promise<IScript>;
        deleteScript(id: string): Promise<void>;
        updateScript(data: IScript): Promise<void>;
        enableScript(id: string): Promise<void>;
        disableScript(id: string): Promise<void>;
        rebuildIndex(refillNullMarkdown?: boolean): Promise<void>;
        addDoc(docId: string, content: string, markdown: string, isDayPage?: boolean): Promise<void>;
        updateDoc(docId: string, content: string, markdown: string, _isDayPage?: boolean): Promise<void>;
        getDoc(docId: string): Promise<any>;
        getDocMarkdown(docId: string): Promise<unknown>;
        /**
         * if you want to create or update a day page, you should pass a day page id. page id is like 2021-01-01
         * @param docId
         * @param mdStr
         * @param parentId
         * @returns
         */
        createOrUpdateDocWithMarkdown(docId: string, mdStr: string, parentId?: string): Promise<any>;
        deleteDoc(docId: string): Promise<void>;
        fullTextSearch(query: string): Promise<{
            id: string;
            result: string;
        }[]>;
        createTable(id: string, name: string, tableSchema: string): Promise<void>;
        fixTable(tableId: string): Promise<void>;
        hasSystemColumn(tableId: string, column: string): Promise<boolean>;
        isTableExist(id: string): Promise<boolean>;
        deleteTable(id: string): Promise<void>;
        listDays(page: number): Promise<{
            id: any;
        }[]>;
        listAllDays(): Promise<{
            id: any;
            content: any;
        }[]>;
        syncExec2(sql: string, bind?: any[]): any[];
        exec2(sql: string, bind?: any[]): Promise<any[]>;
        runAIgeneratedSQL(sql: string, tableName: string): Promise<Record<string, any>[]>;
        listTreeNodes(query?: string, withSubNode?: boolean): Promise<ITreeNode[]>;
        pinNode(id: string, isPinned: boolean): Promise<boolean>;
        updateTreeNodeName(id: string, name: string): Promise<any>;
        addTreeNode(data: ITreeNode): Promise<ITreeNode>;
        getOrCreateTreeNode(data: ITreeNode): Promise<ITreeNode>;
        getTreeNode(id: string): Promise<ITreeNode>;
        moveDraftIntoTable(id: string, tableId: string): Promise<boolean>;
        listUiColumns(tableName: string): Promise<IField[]>;
        /**
         * this will return all ui columns in this space
         * @param tableName
         * @returns
         */
        listAllUiColumns(): Promise<any[]>;
        undo(): void;
        redo(): void;
        private activeAllTablesUndoRedo;
        execute(sql: string, bind?: any[]): {
            fetchone: () => any;
            fetchall: () => any[];
        };
        exec(sql: string, bind?: any[]): void;
        private execSqlWithBind;
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
        onUpdate(): void;
        withTransaction(fn: Function): Promise<any>;
        notify(msg: {
            title: string;
            description: string;
        }): void;
    }
}
declare module "@eidos.space/types" {
    import { DataSpace } from "worker/web-worker/DataSpace";
    export interface Eidos {
        space(spaceName: string): DataSpace;
        currentSpace: DataSpace;
    }
    export interface EidosTable<T = Record<string, string>> {
        id: string;
        name: string;
        fieldsMap: T;
    }
}
