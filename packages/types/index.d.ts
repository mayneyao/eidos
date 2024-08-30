/// <reference types="react" resolution-mode="require"/>
declare module "apps/publish/lib/sqlite-provider/base" {
    export abstract class BaseServerDatabase {
        abstract prepare(sql: string): any;
        abstract close(): void;
        abstract selectObjects(sql: string): Promise<{
            [columnName: string]: any;
        }[]>;
        abstract transaction(): any;
        abstract exec(opts: any): Promise<any>;
        abstract createFunction(): any;
    }
}
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
        BlockUIMsg = "BlockUIMsg",
        DataUpdateSignal = "DataUpdateSignal",
        WebSocketConnected = "WebSocketConnected",
        WebSocketDisconnected = "WebSocketDisconnected",
        ConvertMarkdown2State = "ConvertMarkdown2State",
        ConvertHtml2State = "ConvertHtml2State",
        ConvertEmail2State = "ConvertEmail2State",
        GetDocMarkdown = "GetDocMarkdown",
        HighlightRow = "HighlightRow"
    }
    export enum MainServiceWorkerMsgType {
        SetData = "SetData"
    }
    export enum EidosDataEventChannelMsgType {
        DataUpdateSignalType = "DataUpdateSignalType",
        MetaTableUpdateSignalType = "MetaTableUpdateSignalType"
    }
    export type EidosDataEventChannelMsg = {
        type: EidosDataEventChannelMsgType;
        payload: {
            type: DataUpdateSignalType;
            table: string;
            _new: Record<string, any> & {
                _id: string;
            };
            _old: Record<string, any> & {
                _id: string;
            };
        };
    };
    export enum DataUpdateSignalType {
        Update = "update",
        Insert = "insert",
        Delete = "delete",
        AddColumn = "addColumn",
        UpdateColumn = "updateColumn"
    }
    export const EidosDataEventChannelName = "eidos-data-event";
    export const EidosSharedEnvChannelName = "eidos-shared-env";
    export const DOMAINS: {
        IMAGE_PROXY: string;
        LINK_PREVIEW: string;
        WIKI: string;
        ACTIVATION_SERVER: string;
        EXTENSION_SERVER: string;
        API_AGENT_SERVER: string;
        DISCORD_INVITE: string;
    };
    export enum CustomEventType {
        UpdateColumn = "eidos-update-column"
    }
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
        Lookup = "lookup",
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
declare module "lib/env" {
    export const logger: Console;
    export const EIDOS_VERSION = "0.6.3";
    export const isDevMode: boolean;
    export const isSelfHosted: boolean;
    export const isInkServiceMode: boolean;
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
    export const ReferenceTableName = "eidos__references";
}
declare module "lib/sqlite/helper" {
    export const getTransformedQuery: (query: string) => string;
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
declare module "lib/store/ITreeNode" {
    export interface ITreeNode {
        id: string;
        name: string;
        type: "table" | "doc" | "folder" | string;
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
        Gallery = "gallery",
        DocList = "doc_list"
    }
    export interface IView<T = any> {
        id: string;
        name: string;
        type: ViewTypeEnum;
        table_id: string;
        query: string;
        fieldIds?: string[];
        properties?: T;
        filter?: FilterValueType;
        order_map?: Record<string, number>;
        hidden_fields?: string[];
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
        created_at?: string;
        updated_at?: string;
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
    export { uuidv7 } from "uuidv7";
    export const isUuidv4: (id: string) => boolean;
    export function nonNullable<T>(value: T): value is NonNullable<T>;
    export function cn(...inputs: ClassValue[]): string;
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
    export const getColumnIndexName: (tableName: string, columnName: string) => string;
    export const generateColumnName: () => string;
    export const getRawDocNameById: (id: string) => string;
    export const shortenId: (id: string) => string;
    export const extractIdFromShortId: (shortId: string) => string;
    export const getDate: (offset: number) => string;
    export const getToday: () => string;
    export const getYesterday: () => string;
    export const getTomorrow: () => string;
    /**
     *
     * @param str yyyy-w[week]
     */
    export const isWeekNodeId: (str?: string) => boolean;
    /**
     * get week of the year
     * @param day  yyyy-mm-dd || yyyy-w[week]
     * @returns
     */
    export const getWeek: (day: string) => number;
    /**
     *
     * @param weekNodeId yyyy-w[week]
     * @returns
     */
    export const getDaysByYearWeek: (weekNodeId: string) => any[];
    export const getLocalDate: (date: Date) => string;
    export const getUuid: () => string;
    export const generateId: () => string;
    export const isDayPageId: (id: string) => boolean;
    /**
     * Returns a string representing the time elapsed since the given date.
     * @param date - The date to calculate the time elapsed from.
     * @returns A string representing the time elapsed in a human-readable format.
     */
    export function timeAgo(date: Date): string;
    export const proxyImageURL: (url?: string) => string;
}
declare module "lib/sqlite/sql-formula-parser" {
    import { IField } from "lib/store/interface";
    export const getTableNameFromSql: (sql: string) => string;
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
    export const transformQuery: (sql: string, fields: IField[]) => string;
    export const transformFormula2VirtualGeneratedField: (columnName: string, fields: IField[]) => string;
    export const transformQueryWithFormulaFields2Sql: (query: string, fields: IField[]) => string;
}
declare module "lib/mime/mime" {
    /**
     * source: https://github.com/jshttp/mime-types/blob/master/index.js
     * refactored to typescript via copilot
     * js => ts
     * path => path-browserify
     */
    /*!
     * mime-types
     * Copyright(c) 2014 Jonathan Ong
     * Copyright(c) 2015 Douglas Christopher Wilson
     * MIT Licensed
     */
    /**
     * Get the default charset for a MIME type.
     *
     * @param {string} type
     * @return {boolean|string}
     */
    export const charset: (type: string) => boolean | string;
    /**
     * Create a full Content-Type header given a MIME type or extension.
     *
     * @param {string} str
     * @return {boolean|string}
     */
    export const contentType: (str: string) => boolean | string;
    /**
     * Get the default extension for a MIME type.
     *
     * @param {string} type
     * @return {boolean|string}
     */
    export const extension: (type: string) => boolean | string;
    /**
     * Lookup the MIME type for a file path/extension.
     *
     * @param {string} path
     * @return {boolean|string}
     */
    export const lookup: (path: string) => boolean | string;
    export const extensions: {
        [key: string]: string[];
    };
    export const types: {
        [key: string]: string;
    };
    export const getFileType: (url: string) => boolean | string | "image" | "audio" | "video";
    export const getFilePreviewImage: (url: string) => string;
}
declare module "lib/storage/indexeddb" {
    import { StateStorage } from "zustand/middleware";
    export const indexedDBStorage: StateStorage;
    export const getConfig: <T = Record<string, any>>(name: string) => Promise<T>;
    export const DATABASE_NAME = "eidos";
    export function getIndexedDBValue<T = any>(tableName: string, key: string): Promise<T>;
}
declare module "lib/storage/eidos-file-system" {
    export enum FileSystemType {
        OPFS = "opfs",
        NFS = "nfs"
    }
    export const getFsRootHandle: (fsType: FileSystemType) => Promise<FileSystemDirectoryHandle>;
    export const getExternalFolderHandle: (name: string) => Promise<FileSystemDirectoryHandle>;
    /**
     * get DirHandle for a given path list
     * we read config from indexeddb to decide which file system to use
     * there are two file systems:
     * 1. opfs: origin private file system. store files in web.
     * 2. nfs: Native File System. store files in local file system.
     * @param _paths path list just like ["root", "dir1", "dir2"]
     * @param rootDirHandle we can pass rootDirHandle to avoid reading from indexeddb
     * @returns
     */
    export const getDirHandle: (_paths: string[], rootDirHandle?: FileSystemDirectoryHandle) => Promise<FileSystemDirectoryHandle>;
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
    export class EidosFileSystemManager {
        rootDirHandle: FileSystemDirectoryHandle | undefined;
        constructor(rootDirHandle?: FileSystemDirectoryHandle);
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
        getDocContent: (_paths: string[]) => Promise<string>;
        addDir: (_paths: string[], dirName: string) => Promise<void>;
        addFile: (_paths: string[], file: File, fileId?: string) => Promise<string[]>;
        deleteEntry: (_paths: string[], isDir?: boolean) => Promise<void>;
        renameFile: (_paths: string[], newName: string) => Promise<void>;
    }
    export const efsManager: EidosFileSystemManager;
    export const getExternalFolderManager: (name: string) => Promise<EidosFileSystemManager>;
}
declare module "lib/sqlite/sql-merge-table-with-new-columns" {
    /**
     * sqlite has some limitations on alter table, for example, we can't add a column with non-constant default value.
     * when we want to add new columns to a table
     * 1. we need to create a new table with new columns
     * 2. copy data from old table to new table
     * 3. then drop old table
     * 4. rename new table to old table name.
     * @param createTableSql
     * @param newColumnSql
     */
    export function generateMergeTableWithNewColumnsSql(createTableSql: string, newColumnSql: string): {
        newTmpTableSql: string;
        sql: string;
    };
}
declare module "worker/web-worker/sdk/index-manager" {
    import { DataSpace } from "worker/web-worker/DataSpace";
    import { TableManager } from "worker/web-worker/sdk/table";
    export class IndexManager {
        private table;
        dataSpace: DataSpace;
        tableManager: TableManager;
        constructor(table: TableManager);
        createIndex(column: string, onStart?: () => void, onEnd?: () => void): Promise<void>;
    }
}
declare module "lib/fields/base" {
    import { IField } from "lib/store/interface";
    import { CompareOperator, FieldType } from "lib/fields/const";
    interface IBaseField<CD, P, R, RC, FC> {
        /**
         * column from eidos__columns table, guild how to render this field
         */
        column: IField<P>;
        context: FC | undefined;
        get entityFieldInstance(): BaseField<any, any, any, any, any> | null;
        /**
         * define the compare operators for this field, will be used in the filter
         */
        compareOperators: string[];
        /**
         * for render cell, for grid view
         * @param rawData raw data stored in the database
         * @param context some field need context to render, like user field need user map. we only store the user id in the database
         */
        getCellContent(rawData: any, context?: RC): CD;
        /**
         * we store the raw data in the database, but we need to transform the raw data into json for other usage which make it more readable
         * eg: API, SDK, Script etc
         * {
         *  title: "this is title",
         *  cl_xxx: "field1 value",
         *  cl_yyy: "field2 value",
         * } => {
         *  title: "this is title",
         *  field1: "field1 value",
         *  field2: "field2 value",
         * }
         * @param rawData data stored in the database, most of the time, it's a string
         */
        rawData2JSON(rawData: R): any;
        /**
         * transform the cell data into raw data, which can be stored in the database
         * @param cell cell data, which is the return value of getCellContent
         */
        cellData2RawData(cell: CD): any;
    }
    export abstract class BaseField<CD, P, R = string, RC = any, FC = any> implements IBaseField<CD, P, R, RC, FC> {
        static type: FieldType;
        /**
         * each table column has a corresponding ui column, which stored in the `${ColumnTableName}` table
         * we use the ui column to store the column's display name, type, and other ui related information
         * different field will have different property
         */
        column: IField<P>;
        context: FC | undefined;
        constructor(column: IField<P>, context?: FC);
        get entityFieldInstance(): BaseField<any, any, any, any, any> | null;
        get isTransformable(): boolean;
        abstract get compareOperators(): CompareOperator[];
        /**
         * getCellContent will be called when the cell is rendered
         * transform the raw data into the cell content for rendering
         * @param rawData this is the raw data stored in the database
         */
        abstract getCellContent(rawData: any, context?: RC): CD;
        abstract rawData2JSON(rawData: R): any;
        abstract cellData2RawData(cell: CD): {
            rawData: any;
            shouldUpdateFieldProperty?: boolean;
        };
        /**
         * every field should have a property, when you create a new field, you should implement this method
         * @returns
         */
        static getDefaultFieldProperty(): {};
        text2RawData(text: string | number): string | number;
    }
}
declare module "lib/fields/checkbox" {
    import type { BooleanCell } from "@glideapps/glide-data-grid";
    import { BaseField } from "lib/fields/base";
    import { CompareOperator, FieldType } from "lib/fields/const";
    type CheckboxProperty = {};
    type CheckboxCell = BooleanCell;
    export class CheckboxField extends BaseField<CheckboxCell, CheckboxProperty, number> {
        static type: FieldType;
        get compareOperators(): CompareOperator[];
        rawData2JSON(rawData: number): number;
        getCellContent(rawData: number | undefined): CheckboxCell;
        cellData2RawData(cell: CheckboxCell): {
            rawData: number;
        };
    }
}
declare module "components/table/views/grid/cells/user-profile-cell" {
    import { type CustomCell, type CustomRenderer } from "@glideapps/glide-data-grid";
    export interface UserProfileCellProps {
        readonly kind: "user-profile-cell";
        readonly image: string;
        readonly initial: string;
        readonly tint: string;
        readonly name?: string;
    }
    export type UserProfileCell = CustomCell<UserProfileCellProps>;
    const renderer: CustomRenderer<UserProfileCell>;
    export default renderer;
}
declare module "lib/fields/created-by" {
    import type { UserProfileCell } from "components/table/views/grid/cells/user-profile-cell";
    import { BaseField } from "lib/fields/base";
    import { CompareOperator, FieldType } from "lib/fields/const";
    type CreatedByProperty = {};
    export type UserFieldContext = {
        userMap?: {
            [id: string]: {
                name: string;
                avatar?: string;
            };
        };
    };
    export class CreatedByField extends BaseField<UserProfileCell, CreatedByProperty, string, UserFieldContext> {
        static type: FieldType;
        rawData2JSON(rawData: string): string;
        get compareOperators(): CompareOperator[];
        getCellContent(rawData: string | undefined, context?: UserFieldContext): UserProfileCell;
        cellData2RawData(cell: UserProfileCell): {
            rawData: import("@/components/table/views/grid/cells/user-profile-cell").UserProfileCellProps;
        };
    }
}
declare module "lib/fields/created-time" {
    import { TextCell } from "@glideapps/glide-data-grid";
    import { BaseField } from "lib/fields/base";
    import { CompareOperator, FieldType } from "lib/fields/const";
    type DateProperty = {};
    export class CreatedTimeField extends BaseField<TextCell, DateProperty, string> {
        static type: FieldType;
        rawData2JSON(rawData: string): string;
        get compareOperators(): CompareOperator[];
        getCellContent(rawData: string | undefined): TextCell;
        cellData2RawData(cell: TextCell): {
            rawData: string;
        };
    }
}
declare module "components/ui/button" {
    import * as React from "react";
    import { type VariantProps } from "class-variance-authority";
    const buttonVariants: (props?: {
        variant?: "link" | "default" | "destructive" | "outline" | "secondary" | "ghost";
        size?: "default" | "sm" | "xs" | "lg";
    } & import("class-variance-authority/dist/types").ClassProp) => string;
    export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
        asChild?: boolean;
    }
    const Button: React.ForwardRefExoticComponent<ButtonProps & React.RefAttributes<HTMLButtonElement>>;
    export { Button, buttonVariants };
}
declare module "components/ui/calendar" {
    import * as React from "react";
    import { DayPicker } from "react-day-picker";
    export type CalendarProps = React.ComponentProps<typeof DayPicker>;
    function Calendar({ className, classNames, showOutsideDays, ...props }: CalendarProps): import("react/jsx-runtime").JSX.Element;
    namespace Calendar {
        var displayName: string;
    }
    export { Calendar };
}
declare module "components/table/views/grid/cells/date-picker-cell" {
    import { CustomCell, CustomRenderer } from "@glideapps/glide-data-grid";
    interface DatePickerCellProps {
        readonly kind: "date-picker-cell";
        readonly date: Date | undefined;
        readonly displayDate: string;
        readonly format: "date" | "datetime-local";
    }
    export type DatePickerCell = CustomCell<DatePickerCellProps>;
    const renderer: CustomRenderer<DatePickerCell>;
    export default renderer;
}
declare module "lib/fields/date" {
    import type { DatePickerCell } from "components/table/views/grid/cells/date-picker-cell";
    import { BaseField } from "lib/fields/base";
    import { CompareOperator, FieldType } from "lib/fields/const";
    type DateProperty = {};
    type DateCell = DatePickerCell;
    export class DateField extends BaseField<DateCell, DateProperty, string> {
        static type: FieldType;
        rawData2JSON(rawData: string): string;
        get compareOperators(): CompareOperator[];
        getCellContent(rawData: string | undefined): DateCell;
        cellData2RawData(cell: DateCell): {
            rawData: string;
        };
    }
}
declare module "components/ui/popover" {
    import * as React from "react";
    import * as PopoverPrimitive from "@radix-ui/react-popover";
    const Popover: React.FC<PopoverPrimitive.PopoverProps>;
    const PopoverTrigger: React.ForwardRefExoticComponent<PopoverPrimitive.PopoverTriggerProps & React.RefAttributes<HTMLButtonElement>>;
    const PopoverContent: React.ForwardRefExoticComponent<Omit<PopoverPrimitive.PopoverContentProps & React.RefAttributes<HTMLDivElement>, "ref"> & {
        container?: HTMLElement;
    } & React.RefAttributes<HTMLDivElement>>;
    export { Popover, PopoverTrigger, PopoverContent };
}
declare module "components/ui/separator" {
    import * as React from "react";
    import * as SeparatorPrimitive from "@radix-ui/react-separator";
    const Separator: React.ForwardRefExoticComponent<Omit<SeparatorPrimitive.SeparatorProps & React.RefAttributes<HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
    export { Separator };
}
declare module "worker/web-worker/meta-table/base" {
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
        toJson: (data: T) => T;
        delBy(data: Partial<T>, db?: import("@sqlite.org/sqlite-wasm").Database): Promise<boolean>;
        get(id: string): Promise<T | null>;
        transformData: (data: Partial<T>) => {
            kv: any[][];
            updateKPlaceholder: string;
            insertKPlaceholder: string;
            insertVPlaceholder: string;
            deleteKPlaceholder: string;
            values: any[];
        };
        add(data: T, db?: import("@sqlite.org/sqlite-wasm").Database): Promise<T>;
        set(id: string, data: Partial<T>): Promise<boolean>;
        list(query?: Record<string, any>, opts?: {
            limit?: number;
            offset?: number;
            orderBy?: string;
            order?: "ASC" | "DESC";
            fields?: string[];
        }): Promise<T[]>;
    }
}
declare module "worker/web-worker/meta-table/file" {
    import { FileSystemType } from "lib/storage/eidos-file-system";
    import { BaseTable, BaseTableImpl } from "worker/web-worker/meta-table/base";
    export interface IFile {
        id: string;
        name: string;
        path: string;
        size: number;
        mime: string;
        created_at?: string;
        is_vectorized?: boolean;
    }
    export class FileTable extends BaseTableImpl implements BaseTable<IFile> {
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
    }
}
declare module "lib/store/runtime-store" {
    /**
     * state store for runtime, for cross component communication
     */
    import { IFile } from "worker/web-worker/meta-table/file";
    interface AppRuntimeState {
        isCmdkOpen: boolean;
        setCmdkOpen: (isCmdkOpen: boolean) => void;
        isKeyboardShortcutsOpen: boolean;
        setKeyboardShortcutsOpen: (isKeyboardShortcutsOpen: boolean) => void;
        isShareMode: boolean;
        setShareMode: (isShareMode: boolean) => void;
        isEmbeddingModeLoaded: boolean;
        setEmbeddingModeLoaded: (isEmbeddingModeLoaded: boolean) => void;
        currentPreviewFile: IFile | null;
        setCurrentPreviewFile: (currentPreviewFile: IFile) => void;
        isWebsocketConnected: boolean;
        setWebsocketConnected: (isWebsocketConnected: boolean) => void;
        disableDocAIComplete: boolean;
        setDisableDocAIComplete: (disableDocAIComplete: boolean) => void;
        isCompleteLoading: boolean;
        setCompleteLoading: (isCompleteLoading: boolean) => void;
        scriptContainerRef: React.RefObject<any> | null;
        setScriptContainerRef: (scriptContainerRef: React.RefObject<any>) => void;
        blockUIMsg: string | null;
        blockUIData?: Record<string, any>;
        setBlockUIMsg: (blockUIMsg: string | null) => void;
        setBlockUIData: (blockUIData: Record<string, any>) => void;
    }
    export const useAppRuntimeStore: import("zustand").UseBoundStore<import("zustand").StoreApi<AppRuntimeState>>;
}
declare module "components/doc/nodes/ImageNode/ImageResizer" {
    import type { LexicalEditor } from "lexical";
    export default function ImageResizer({ onResizeStart, onResizeEnd, buttonRef, imageRef, maxWidth, editor, showCaption, setShowCaption, captionsEnabled, }: {
        editor: LexicalEditor;
        buttonRef: {
            current: null | HTMLButtonElement;
        };
        imageRef: {
            current: null | HTMLElement;
        };
        maxWidth?: number;
        onResizeEnd: (width: "inherit" | number, height: "inherit" | number) => void;
        onResizeStart: () => void;
        setShowCaption: (show: boolean) => void;
        showCaption: boolean;
        captionsEnabled: boolean;
    }): JSX.Element;
}
declare module "components/doc/nodes/ImageNode/ImageComponent" {
    import { type LexicalEditor, type NodeKey } from "lexical";
    import "./ImageNode.css";
    export default function ImageComponent({ src, altText, nodeKey, width, height, maxWidth, resizable, showCaption, caption, captionsEnabled, }: {
        altText: string;
        caption: LexicalEditor;
        height: "inherit" | number;
        maxWidth: number;
        nodeKey: NodeKey;
        resizable: boolean;
        showCaption: boolean;
        src: string;
        width: "inherit" | number;
        captionsEnabled: boolean;
    }): JSX.Element;
}
declare module "components/doc/nodes/ImageNode/ImageNode" {
    import { TextMatchTransformer } from "@lexical/markdown";
    import { DecoratorNode, type DOMConversionMap, type DOMExportOutput, type EditorConfig, type LexicalEditor, type LexicalNode, type NodeKey, type SerializedEditor, type SerializedLexicalNode, type Spread } from "lexical";
    export interface ImagePayload {
        altText: string;
        caption?: LexicalEditor;
        height?: number;
        key?: NodeKey;
        maxWidth?: number;
        showCaption?: boolean;
        src: string;
        width?: number;
        captionsEnabled?: boolean;
    }
    export type SerializedImageNode = Spread<{
        altText: string;
        caption: SerializedEditor;
        height?: number;
        maxWidth: number;
        showCaption: boolean;
        src: string;
        width?: number;
    }, SerializedLexicalNode>;
    export class ImageNode extends DecoratorNode<JSX.Element> {
        __src: string;
        __altText: string;
        __width: "inherit" | number;
        __height: "inherit" | number;
        __maxWidth: number;
        __showCaption: boolean;
        __caption: LexicalEditor;
        __captionsEnabled: boolean;
        static getType(): string;
        static clone(node: ImageNode): ImageNode;
        static importJSON(serializedNode: SerializedImageNode): ImageNode;
        exportDOM(): DOMExportOutput;
        static importDOM(): DOMConversionMap | null;
        constructor(src: string, altText: string, maxWidth: number, width?: "inherit" | number, height?: "inherit" | number, showCaption?: boolean, caption?: LexicalEditor, captionsEnabled?: boolean, key?: NodeKey);
        exportJSON(): SerializedImageNode;
        setWidthAndHeight(width: "inherit" | number, height: "inherit" | number): void;
        setSrc(src: string): void;
        setShowCaption(showCaption: boolean): void;
        createDOM(config: EditorConfig): HTMLElement;
        updateDOM(): false;
        getSrc(): string;
        getAltText(): string;
        decorate(): JSX.Element;
    }
    export function $createImageNode({ altText, height, maxWidth, captionsEnabled, src, width, showCaption, caption, key, }: ImagePayload): ImageNode;
    export function $isImageNode(node: LexicalNode | null | undefined): node is ImageNode;
    export const IMAGE: TextMatchTransformer;
}
declare module "components/ui/table" {
    import * as React from "react";
    const Table: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLTableElement> & React.RefAttributes<HTMLTableElement>>;
    const TableHeader: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLTableSectionElement> & React.RefAttributes<HTMLTableSectionElement>>;
    const TableBody: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLTableSectionElement> & React.RefAttributes<HTMLTableSectionElement>>;
    const TableFooter: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLTableSectionElement> & React.RefAttributes<HTMLTableSectionElement>>;
    const TableRow: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLTableRowElement> & React.RefAttributes<HTMLTableRowElement>>;
    const TableHead: React.ForwardRefExoticComponent<React.ThHTMLAttributes<HTMLTableCellElement> & React.RefAttributes<HTMLTableCellElement>>;
    const TableCell: React.ForwardRefExoticComponent<React.TdHTMLAttributes<HTMLTableCellElement> & React.RefAttributes<HTMLTableCellElement>>;
    const TableCaption: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLTableCaptionElement> & React.RefAttributes<HTMLTableCaptionElement>>;
    export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption, };
}
declare module "components/ui/dialog" {
    import * as React from "react";
    import * as DialogPrimitive from "@radix-ui/react-dialog";
    const Dialog: React.FC<DialogPrimitive.DialogProps>;
    const DialogTrigger: React.ForwardRefExoticComponent<DialogPrimitive.DialogTriggerProps & React.RefAttributes<HTMLButtonElement>>;
    const DialogContent: React.ForwardRefExoticComponent<Omit<DialogPrimitive.DialogContentProps & React.RefAttributes<HTMLDivElement>, "ref"> & {
        hideCloseButton?: boolean;
    } & React.RefAttributes<HTMLDivElement>>;
    const DialogHeader: {
        ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): import("react/jsx-runtime").JSX.Element;
        displayName: string;
    };
    const DialogFooter: {
        ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): import("react/jsx-runtime").JSX.Element;
        displayName: string;
    };
    const DialogTitle: React.ForwardRefExoticComponent<Omit<DialogPrimitive.DialogTitleProps & React.RefAttributes<HTMLHeadingElement>, "ref"> & React.RefAttributes<HTMLHeadingElement>>;
    const DialogDescription: React.ForwardRefExoticComponent<Omit<DialogPrimitive.DialogDescriptionProps & React.RefAttributes<HTMLParagraphElement>, "ref"> & React.RefAttributes<HTMLParagraphElement>>;
    export { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, };
}
declare module "components/ui/input" {
    import * as React from "react";
    export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    }
    const Input: React.ForwardRefExoticComponent<InputProps & React.RefAttributes<HTMLInputElement>>;
    export { Input };
}
declare module "components/doc/hooks/useModal" {
    export function useModal(): [
        JSX.Element | null,
        (title: string, showModal: (onClose: () => void) => JSX.Element) => void
    ];
}
declare module "components/doc/plugins/SQLPlugin/index" {
    import { LexicalCommand } from "lexical";
    export const INSERT_SQL_COMMAND: LexicalCommand<string>;
    export const SQLPlugin: () => any;
}
declare module "components/doc/plugins/SQLPlugin/SqlQueryDialog" {
    import { LexicalEditor } from "lexical";
    interface SqlQueryDialogProps {
        activeEditor: LexicalEditor;
        onClose: () => void;
        sql?: string;
        handleSqlChange?: (sql: string) => void;
    }
    export const SqlQueryDialog: (props: SqlQueryDialogProps) => import("react/jsx-runtime").JSX.Element;
}
declare module "components/doc/utils/sql" {
    export const getQueryResultText: (data: any) => any;
}
declare module "components/doc/nodes/SQLNode/helper" {
    /**
     * [{count:0}] => TEXT
     * [{count:0, name: 'a'}] => CARD
     * [{count:0}, {count:1}] => LIST
     * [{count:0, name: 'a'}, {count:1, name: 'b'}] => TABLE
     * @param data
     */
    export enum QueryResultType {
        TEXT = "TEXT",
        CARD = "CARD",
        LIST = "LIST",
        TABLE = "TABLE"
    }
    export const getQueryResultType: (data: object[]) => QueryResultType;
}
declare module "components/doc/nodes/SQLNode/component" {
    type SQLProps = Readonly<{
        sql: string;
        nodeKey: string;
    }>;
    export function SQLComponent({ sql, nodeKey }: SQLProps): import("react/jsx-runtime").JSX.Element;
}
declare module "components/doc/nodes/SQLNode/index" {
    import { ElementTransformer } from "@lexical/markdown";
    import { DecoratorNode, type LexicalNode, type NodeKey } from "lexical";
    import { ReactNode } from "react";
    export class SQLNode extends DecoratorNode<ReactNode> {
        sql: string;
        static getType(): string;
        static clone(node: SQLNode): SQLNode;
        static importJSON(serializedNode: any): SQLNode;
        exportJSON(): any;
        constructor(sql: string, key?: NodeKey);
        getTextContent(): string;
        setSQL(sql: string): void;
        updateDOM(): false;
        createDOM(): HTMLElement;
        decorate(): JSX.Element;
        canInsertTextBefore(): boolean;
        canInsertTextAfter(): boolean;
        isInline(): boolean;
    }
    export function $createSQLNode(sql: string): SQLNode;
    export function $isSQLNode(node: SQLNode | LexicalNode | null | undefined): node is SQLNode;
    export const SQL_NODE_TRANSFORMER: ElementTransformer;
}
declare module "components/loading" {
    export const Loading: () => import("react/jsx-runtime").JSX.Element;
    export const TwinkleSparkle: () => import("react/jsx-runtime").JSX.Element;
}
declare module "components/doc/nodes/BookmarkNode/BookmarkComponent" {
    import { NodeKey } from "lexical";
    import { BookmarkPayload } from "components/doc/nodes/BookmarkNode/index";
    import "./style.css";
    export const BookmarkComponent: (props: BookmarkPayload & {
        nodeKey: NodeKey;
    }) => import("react/jsx-runtime").JSX.Element;
}
declare module "components/doc/nodes/BookmarkNode/index" {
    import { ReactNode } from "react";
    import { TextMatchTransformer } from "@lexical/markdown";
    import { DecoratorNode, EditorConfig, LexicalEditor, LexicalNode, NodeKey } from "lexical";
    export interface BookmarkPayload {
        url: string;
        title?: string;
        description?: string;
        image?: string;
        fetched?: boolean;
        key?: NodeKey;
    }
    export class BookmarkNode extends DecoratorNode<ReactNode> {
        __url: string;
        __title?: string;
        __description?: string;
        __image?: string;
        __fetched?: boolean;
        isKeyboardSelectable(): boolean;
        static getType(): string;
        static clone(node: BookmarkNode): BookmarkNode;
        getTextContent(): string;
        constructor(payload: BookmarkPayload);
        getFetched(): boolean;
        getUrl(): string;
        createDOM(): HTMLElement;
        updateDOM(): false;
        decorate(_editor: LexicalEditor, config: EditorConfig): ReactNode;
        static importJSON(data: any): BookmarkNode;
        setAll(payload: BookmarkPayload): void;
        exportJSON(): {
            key: string;
            url: string;
            title: string;
            description: string;
            image: string;
            fetched: boolean;
            type: string;
            version: number;
        };
    }
    export function $createBookmarkNode(payload: BookmarkPayload): BookmarkNode;
    export function $isBookmarkNode(node: LexicalNode | null | undefined): node is BookmarkNode;
    export function $getUrlMetaData(url: string): Promise<BookmarkPayload & {
        error?: string;
    }>;
    export const BOOKMARK: TextMatchTransformer;
}
declare module "components/doc/nodes/CardNode/index" {
    import { ElementNode, LexicalNode, SerializedElementNode, SerializedLexicalNode } from "lexical";
    export class CardNode extends ElementNode {
        static getType(): string;
        static clone(node: CardNode): CardNode;
        exportJSON(): SerializedElementNode<SerializedLexicalNode>;
        static importJSON(json: SerializedElementNode<SerializedLexicalNode>): CardNode;
        createDOM(): HTMLElement;
        updateDOM(prevNode: CardNode, dom: HTMLElement): boolean;
        canInsertTextBefore(): boolean;
        canInsertTextAfter(): boolean;
        canIndent(): false;
    }
    export function $createCardNode(): CardNode;
    export function $isCardNode(node: LexicalNode | null | undefined): node is CardNode;
}
declare module "components/doc/plugins/MarkdownTransformers" {
    import { ElementTransformer } from "@lexical/markdown";
    export const HR: ElementTransformer;
}
declare module "components/doc/blocks/interface" {
    import { Transformer } from "@lexical/markdown";
    import { LexicalCommand } from "lexical";
    import { FunctionComponent } from "react";
    export interface DocBlock {
        name: string;
        icon: string;
        node: any;
        plugin: FunctionComponent;
        onSelect: (editor: any) => void;
        keywords: string[];
        transform?: Transformer;
        command: {
            create: LexicalCommand<any>;
        };
        createNode: (args: any) => any;
        markdownLanguage?: string;
    }
}
declare module "components/ui/dropdown-menu" {
    import * as React from "react";
    import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
    const DropdownMenu: React.FC<DropdownMenuPrimitive.DropdownMenuProps>;
    const DropdownMenuTrigger: React.ForwardRefExoticComponent<DropdownMenuPrimitive.DropdownMenuTriggerProps & React.RefAttributes<HTMLButtonElement>>;
    const DropdownMenuGroup: React.ForwardRefExoticComponent<DropdownMenuPrimitive.DropdownMenuGroupProps & React.RefAttributes<HTMLDivElement>>;
    const DropdownMenuPortal: React.FC<DropdownMenuPrimitive.DropdownMenuPortalProps>;
    const DropdownMenuSub: React.FC<DropdownMenuPrimitive.DropdownMenuSubProps>;
    const DropdownMenuRadioGroup: React.ForwardRefExoticComponent<DropdownMenuPrimitive.DropdownMenuRadioGroupProps & React.RefAttributes<HTMLDivElement>>;
    const DropdownMenuSubTrigger: React.ForwardRefExoticComponent<Omit<DropdownMenuPrimitive.DropdownMenuSubTriggerProps & React.RefAttributes<HTMLDivElement>, "ref"> & {
        inset?: boolean;
    } & React.RefAttributes<HTMLDivElement>>;
    const DropdownMenuSubContent: React.ForwardRefExoticComponent<Omit<DropdownMenuPrimitive.DropdownMenuSubContentProps & React.RefAttributes<HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
    const DropdownMenuContent: React.ForwardRefExoticComponent<Omit<DropdownMenuPrimitive.DropdownMenuContentProps & React.RefAttributes<HTMLDivElement>, "ref"> & {
        container?: HTMLElement;
    } & React.RefAttributes<HTMLDivElement>>;
    const DropdownMenuItem: React.ForwardRefExoticComponent<Omit<DropdownMenuPrimitive.DropdownMenuItemProps & React.RefAttributes<HTMLDivElement>, "ref"> & {
        inset?: boolean;
    } & React.RefAttributes<HTMLDivElement>>;
    const DropdownMenuCheckboxItem: React.ForwardRefExoticComponent<Omit<DropdownMenuPrimitive.DropdownMenuCheckboxItemProps & React.RefAttributes<HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
    const DropdownMenuRadioItem: React.ForwardRefExoticComponent<Omit<DropdownMenuPrimitive.DropdownMenuRadioItemProps & React.RefAttributes<HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
    const DropdownMenuLabel: React.ForwardRefExoticComponent<Omit<DropdownMenuPrimitive.DropdownMenuLabelProps & React.RefAttributes<HTMLDivElement>, "ref"> & {
        inset?: boolean;
    } & React.RefAttributes<HTMLDivElement>>;
    const DropdownMenuSeparator: React.ForwardRefExoticComponent<Omit<DropdownMenuPrimitive.DropdownMenuSeparatorProps & React.RefAttributes<HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
    const DropdownMenuShortcut: {
        ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>): import("react/jsx-runtime").JSX.Element;
        displayName: string;
    };
    export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuGroup, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuRadioGroup, };
}
declare module "components/ui/textarea" {
    import * as React from "react";
    export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    }
    const Textarea: React.ForwardRefExoticComponent<TextareaProps & React.RefAttributes<HTMLTextAreaElement>>;
    export { Textarea };
}
declare module "components/ui/toast" {
    import * as React from "react";
    import * as ToastPrimitives from "@radix-ui/react-toast";
    import { type VariantProps } from "class-variance-authority";
    const ToastProvider: React.FC<ToastPrimitives.ToastProviderProps>;
    const ToastViewport: React.ForwardRefExoticComponent<Omit<ToastPrimitives.ToastViewportProps & React.RefAttributes<HTMLOListElement>, "ref"> & React.RefAttributes<HTMLOListElement>>;
    const Toast: React.ForwardRefExoticComponent<Omit<ToastPrimitives.ToastProps & React.RefAttributes<HTMLLIElement>, "ref"> & VariantProps<(props?: {
        variant?: "default" | "destructive";
    } & import("class-variance-authority/dist/types").ClassProp) => string> & React.RefAttributes<HTMLLIElement>>;
    const ToastAction: React.ForwardRefExoticComponent<Omit<ToastPrimitives.ToastActionProps & React.RefAttributes<HTMLButtonElement>, "ref"> & React.RefAttributes<HTMLButtonElement>>;
    const ToastClose: React.ForwardRefExoticComponent<Omit<ToastPrimitives.ToastCloseProps & React.RefAttributes<HTMLButtonElement>, "ref"> & React.RefAttributes<HTMLButtonElement>>;
    const ToastTitle: React.ForwardRefExoticComponent<Omit<ToastPrimitives.ToastTitleProps & React.RefAttributes<HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
    const ToastDescription: React.ForwardRefExoticComponent<Omit<ToastPrimitives.ToastDescriptionProps & React.RefAttributes<HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
    type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;
    type ToastActionElement = React.ReactElement<typeof ToastAction>;
    export { type ToastProps, type ToastActionElement, ToastProvider, ToastViewport, Toast, ToastTitle, ToastDescription, ToastClose, ToastAction, };
}
declare module "components/ui/use-toast" {
    import * as React from "react";
    import type { ToastActionElement, ToastProps } from "components/ui/toast";
    type ToasterToast = ToastProps & {
        id: string;
        title?: React.ReactNode;
        description?: React.ReactNode;
        action?: ToastActionElement;
    };
    const actionTypes: {
        readonly ADD_TOAST: "ADD_TOAST";
        readonly UPDATE_TOAST: "UPDATE_TOAST";
        readonly DISMISS_TOAST: "DISMISS_TOAST";
        readonly REMOVE_TOAST: "REMOVE_TOAST";
    };
    type ActionType = typeof actionTypes;
    type Action = {
        type: ActionType["ADD_TOAST"];
        toast: ToasterToast;
    } | {
        type: ActionType["UPDATE_TOAST"];
        toast: Partial<ToasterToast>;
    } | {
        type: ActionType["DISMISS_TOAST"];
        toastId?: ToasterToast["id"];
    } | {
        type: ActionType["REMOVE_TOAST"];
        toastId?: ToasterToast["id"];
    };
    interface State {
        toasts: ToasterToast[];
    }
    export const reducer: (state: State, action: Action) => State;
    type Toast = Omit<ToasterToast, "id">;
    function toast({ ...props }: Toast): {
        id: string;
        dismiss: () => void;
        update: (props: ToasterToast) => void;
    };
    function useToast(): {
        toast: typeof toast;
        dismiss: (toastId?: string) => void;
        toasts: ToasterToast[];
    };
    export { useToast, toast };
}
declare module "components/doc/blocks/mermaid/component" {
    import { NodeKey } from "lexical";
    export interface MermaidProps {
        text: string;
        nodeKey: NodeKey;
    }
    export const Mermaid: React.FC<MermaidProps>;
}
declare module "components/doc/blocks/mermaid/node" {
    import { ReactNode } from "react";
    import { TextMatchTransformer } from "@lexical/markdown";
    import { DecoratorNode, EditorConfig, LexicalEditor, LexicalNode, NodeKey } from "lexical";
    export class MermaidNode extends DecoratorNode<ReactNode> {
        __text: string;
        static getType(): string;
        static clone(node: MermaidNode): MermaidNode;
        constructor(text: string, key?: NodeKey);
        setText(text: string): void;
        createDOM(): HTMLElement;
        updateDOM(): false;
        exportJSON(): any;
        static importJSON(_serializedNode: any): MermaidNode;
        decorate(_editor: LexicalEditor, config: EditorConfig): ReactNode;
    }
    export function $createMermaidNode(text: string): MermaidNode;
    export function $isMermaidNode(node: LexicalNode | null | undefined): node is MermaidNode;
    export const MERMAID_NODE_TRANSFORMER: TextMatchTransformer;
}
declare module "components/doc/blocks/mermaid/plugin" {
    import { LexicalCommand } from "lexical";
    export const INSERT_MERMAID_COMMAND: LexicalCommand<string>;
    export function MermaidPlugin(): JSX.Element | null;
}
declare module "components/doc/blocks/mermaid/index" {
    import { DocBlock } from "components/doc/blocks/interface";
    const _default: DocBlock;
    export default _default;
}
declare module "components/doc/blocks/video/component" {
    import { NodeKey } from "lexical";
    export const VideoComponent: (props: {
        url: string;
        nodeKey: NodeKey;
    }) => import("react/jsx-runtime").JSX.Element;
}
declare module "components/doc/blocks/video/node" {
    import { ReactNode } from "react";
    import { DecoratorNode, EditorConfig, LexicalEditor, LexicalNode, NodeKey, SerializedLexicalNode, Spread } from "lexical";
    export type SerializedVideoNode = Spread<{
        src: string;
    }, SerializedLexicalNode>;
    export class VideoNode extends DecoratorNode<ReactNode> {
        __src: string;
        static getType(): string;
        static clone(node: VideoNode): VideoNode;
        constructor(src: string, key?: NodeKey);
        setSrc(src: string): void;
        createDOM(): HTMLElement;
        updateDOM(): false;
        static importJSON(data: SerializedVideoNode): VideoNode;
        exportJSON(): {
            src: string;
            type: string;
            version: number;
        };
        decorate(_editor: LexicalEditor, config: EditorConfig): ReactNode;
        getTextContent(): string;
    }
    export function $createVideoNode(src: string): VideoNode;
    export function $isVideoNode(node: LexicalNode | null | undefined): node is VideoNode;
}
declare module "components/doc/blocks/video/plugin" {
    import { LexicalCommand } from "lexical";
    export const INSERT_VIDEO_FILE_COMMAND: LexicalCommand<string>;
    export const VideoPlugin: () => any;
}
declare module "components/doc/blocks/video/index" {
    import { DocBlock } from "components/doc/blocks/interface";
    const _default_1: DocBlock;
    export default _default_1;
}
declare module "components/doc/blocks/audio/component" {
    import { NodeKey } from "lexical";
    export const AudioComponent: (props: {
        url: string;
        nodeKey: NodeKey;
    }) => import("react/jsx-runtime").JSX.Element;
}
declare module "components/doc/blocks/audio/node" {
    import { ReactNode } from "react";
    import { DecoratorNode, EditorConfig, LexicalEditor, LexicalNode, NodeKey, SerializedLexicalNode, Spread } from "lexical";
    export type SerializedAudioNode = Spread<{
        src: string;
    }, SerializedLexicalNode>;
    export class AudioNode extends DecoratorNode<ReactNode> {
        __src: string;
        static getType(): string;
        static clone(node: AudioNode): AudioNode;
        constructor(src: string, key?: NodeKey);
        setSrc(src: string): void;
        createDOM(): HTMLElement;
        updateDOM(): false;
        static importJSON(data: SerializedAudioNode): AudioNode;
        exportJSON(): {
            src: string;
            type: string;
            version: number;
        };
        decorate(_editor: LexicalEditor, config: EditorConfig): ReactNode;
        getTextContent(): string;
    }
    export function $createAudioNode(src: string): AudioNode;
    export function $isAudioNode(node: LexicalNode | null | undefined): node is AudioNode;
}
declare module "components/doc/blocks/audio/plugin" {
    import { LexicalCommand } from "lexical";
    export const INSERT_AUDIO_FILE_COMMAND: LexicalCommand<string>;
    export const AudioPlugin: () => any;
}
declare module "components/doc/blocks/audio/index" {
    import { DocBlock } from "components/doc/blocks/interface";
    const _default_2: DocBlock;
    export default _default_2;
}
declare module "components/doc/blocks/file/component" {
    import { NodeKey } from "lexical";
    export const FileComponent: ({ url, fileName, nodeKey, }: {
        url: string;
        fileName: string;
        nodeKey: NodeKey;
    }) => import("react/jsx-runtime").JSX.Element;
}
declare module "components/doc/blocks/file/node" {
    import { ReactNode } from "react";
    import { DecoratorNode, EditorConfig, LexicalEditor, LexicalNode, NodeKey, SerializedLexicalNode, Spread } from "lexical";
    export type SerializedFileNode = Spread<{
        src: string;
        fileName: string;
    }, SerializedLexicalNode>;
    export class FileNode extends DecoratorNode<ReactNode> {
        __src: string;
        __fileName: string;
        static getType(): string;
        static clone(node: FileNode): FileNode;
        constructor(src: string, fileName: string, key?: NodeKey);
        setSrc(src: string): void;
        setFileName(fileName: string): void;
        createDOM(): HTMLElement;
        updateDOM(): false;
        static importJSON(data: SerializedFileNode): FileNode;
        exportJSON(): {
            src: string;
            fileName: string;
            type: string;
            version: number;
        };
        decorate(_editor: LexicalEditor, config: EditorConfig): ReactNode;
        getTextContent(): string;
    }
    export function $createFileNode(data: {
        src: string;
        fileName: string;
    }): FileNode;
    export function $isFileNode(node: LexicalNode | null | undefined): node is FileNode;
}
declare module "components/doc/blocks/file/plugin" {
    import { LexicalCommand } from "lexical";
    export const INSERT_FILE_COMMAND: LexicalCommand<{
        src: string;
        fileName: string;
    }>;
    export const FilePlugin: () => any;
}
declare module "components/doc/blocks/file/index" {
    import { DocBlock } from "components/doc/blocks/interface";
    const _default_3: DocBlock;
    export default _default_3;
}
declare module "components/doc/blocks/index" {
    import { DocBlock } from "components/doc/blocks/interface";
    export const BuiltInBlocks: DocBlock[];
}
declare module "components/doc/plugins/const" {
    import { Transformer } from "@lexical/markdown";
    import { BookmarkPayload } from "components/doc/nodes/BookmarkNode/index";
    export const allTransformers: Transformer[];
    export const fgColors: {
        name: string;
        value: string;
    }[];
    export const bgColors: {
        name: string;
        value: string;
    }[];
    export const markdownLinkInfoMap: Map<string, BookmarkPayload>;
}
declare module "components/doc/plugins/AutoSavePlugin/index" {
    interface AutoSavePluginProps {
        docId: string;
        disableManuallySave?: boolean;
        isEditable?: boolean;
    }
    export const DefaultState: {
        root: {
            children: {
                children: any[];
                direction: any;
                format: string;
                indent: number;
                type: string;
                version: number;
            }[];
            direction: any;
            format: string;
            indent: number;
            type: string;
            version: number;
        };
    };
    export function EidosAutoSavePlugin(props: AutoSavePluginProps): any;
}
declare module "components/table/views/grid/fields/colums" {
    import { GridCellKind, GridColumnIcon } from "@glideapps/glide-data-grid";
    export const defaultAllColumnsHandle: ({
        title: string;
        width: number;
        icon: GridColumnIcon;
        hasMenu: boolean;
        kind: GridCellKind;
        getContent: (rawData: any) => {
            kind: GridCellKind;
            data: any;
            allowOverlay: boolean;
        };
    } | {
        title: string;
        width: number;
        icon: GridColumnIcon;
        hasMenu: boolean;
        kind: GridCellKind;
        getContent: () => {
            kind: GridCellKind;
            allowOverlay: boolean;
        };
    })[];
}
declare module "components/table/views/grid/helper" {
    import { GridCellKind } from "@glideapps/glide-data-grid";
    import { IField } from "lib/store/interface";
    import { defaultAllColumnsHandle } from "components/table/views/grid/fields/colums";
    export function getColumnsHandleMap(): {
        [kind: string]: Omit<(typeof defaultAllColumnsHandle)[0], "getContent"> & {
            getContent: (data: any) => any;
        };
    };
    export const columnsHandleMap: {
        [kind: string]: Omit<{
            title: string;
            width: number;
            icon: import("@glideapps/glide-data-grid").GridColumnIcon;
            hasMenu: boolean;
            kind: GridCellKind;
            getContent: (rawData: any) => {
                kind: GridCellKind;
                data: any;
                allowOverlay: boolean;
            };
        } | {
            title: string;
            width: number;
            icon: import("@glideapps/glide-data-grid").GridColumnIcon;
            hasMenu: boolean;
            kind: GridCellKind;
            getContent: () => {
                kind: GridCellKind;
                allowOverlay: boolean;
            };
        }, "getContent"> & {
            getContent: (data: any) => any;
        };
    };
    export const getShowColumns: (uiColumns: IField[], options: {
        fieldWidthMap?: Record<string, number>;
        orderMap?: Record<string, number>;
        hiddenFields?: string[];
    }) => IField[];
    export const guessCellKind: (value: any) => GridCellKind.Uri | GridCellKind.Text | GridCellKind.Number | GridCellKind.Boolean;
    export const createTemplateTableSql: (tableName: string) => string;
    export const createTemplateTableColumnsSql: () => string;
    export const getScrollbarWidth: () => number;
}
declare module "hooks/use-nodes" {
    import { ITreeNode } from "lib/store/ITreeNode";
    export const useAllNodes: (opts?: {
        isDeleted?: boolean;
        parent_id?: string;
        type?: ITreeNode["type"] | ITreeNode["type"][];
    }) => ITreeNode[];
    export const useNode: () => {
        updateIcon: (id: string, icon: string) => Promise<void>;
        updateCover: (id: string, cover: string) => Promise<void>;
        updatePosition: (id: string, position: number) => Promise<void>;
        updateParentId: (id: string, parentId?: string, opts?: {
            targetId: string;
            targetDirection: "up" | "down";
        }) => Promise<void>;
        updateHideProperties: (id: string, hideProperties: boolean) => Promise<void>;
        moveIntoTable: (nodeId: string, tableId: string, parentId?: string) => Promise<void>;
    };
}
declare module "hooks/use-sqlite" {
    import type { DataSpace } from "worker/web-worker/DataSpace";
    import { ITreeNode } from "lib/store/ITreeNode";
    import { IView } from "lib/store/IView";
    import { IDataStore, IField } from "lib/store/interface";
    interface SqliteState {
        isInitialized: boolean;
        setInitialized: (isInitialized: boolean) => void;
        currentNode: ITreeNode | null;
        setCurrentNode: (node: ITreeNode | null) => void;
        dataStore: IDataStore;
        setAllNodes: (tables: ITreeNode[]) => void;
        setNode: (node: Partial<ITreeNode> & {
            id: string;
        }) => void;
        delNode: (nodeId: string) => void;
        addNode: (node: ITreeNode) => void;
        allUiColumns: IField[];
        setAllUiColumns: (columns: IField[]) => void;
        setViews: (tableId: string, views: IView[]) => void;
        setFields: (tableId: string, fields: IField[]) => void;
        setRows: (tableId: string, rows: Record<string, any>[]) => void;
        delRows: (tableId: string, rowIds: string[]) => void;
        getRowById: (tableId: string, rowId: string) => Record<string, any> | null;
        getRowIds: (tableId: string) => string[];
        setView: (tableId: string, viewId: string, view: Partial<IView>) => void;
        cleanFieldData: (tableId: string, fieldId: string) => void;
        selectedTable: string;
        setSelectedTable: (table: string) => void;
        spaceList: string[];
        setSpaceList: (spaceList: string[]) => void;
        sqliteProxy: DataSpace | null;
        setSqliteProxy: (sqlWorker: DataSpace) => void;
    }
    export const useSqliteStore: import("zustand").UseBoundStore<import("zustand").StoreApi<SqliteState>>;
    export const useSqlite: (dbName?: string) => {
        sqlite: DataSpace;
        createTable: (tableName: string, parent_id?: string) => Promise<string>;
        deleteTable: (tableId: string) => Promise<void>;
        createFolder: (parent_id?: string) => Promise<string>;
        duplicateTable: (oldTableName: string, newTableName: string) => Promise<void>;
        queryAllTables: () => Promise<ITreeNode[]>;
        updateNodeList: () => Promise<void>;
        createTableWithSql: (createTableSql: string, insertSql?: string) => Promise<void>;
        createTableWithSqlAndInsertSqls: (props: {
            tableId: string;
            tableName: string;
            createTableSql: string;
            insertSql?: any[];
            callback?: (progress: number) => void;
        }) => Promise<void>;
        updateTableData: (sql: string) => Promise<void>;
        handleSql: (sql: string) => Promise<boolean>;
        undo: () => Promise<void>;
        redo: () => Promise<void>;
        createDoc: (docName: string, parent_id?: string, nodeId?: string) => Promise<string>;
        updateDoc: (docId: string, content: string, markdown: string) => Promise<void>;
        renameNode: (nodeId: string, newName: string) => Promise<void>;
        getDoc: (docId: string) => Promise<any>;
        deleteNode: (node: ITreeNode) => Promise<void>;
        restoreNode: (node: ITreeNode) => Promise<void>;
        toggleNodeFullWidth: (node: ITreeNode) => Promise<void>;
        toggleNodeLock: (node: ITreeNode) => Promise<void>;
        permanentlyDeleteNode: (node: ITreeNode) => Promise<void>;
        getOrCreateTableSubDoc: (data: {
            docId: string;
            tableId: string;
            title: string;
        }) => Promise<ITreeNode>;
        updateNodeName: (nodeId: string, newName: string) => Promise<void>;
    };
}
declare module "hooks/use-current-node" {
    import { ITreeNode } from "lib/store/ITreeNode";
    export const useNodeMap: () => {
        [nodeId: string]: ITreeNode;
    };
    export const useCurrentNode: () => ITreeNode;
    export type INodePath = ITreeNode & {
        path?: string;
    };
    export const useCurrentNodePath: ({ nodeId, parentId, }: {
        nodeId?: string;
        parentId?: string;
    }) => INodePath[];
}
declare module "hooks/use-current-pathinfo" {
    export const useCurrentPathInfo: () => {
        database: string;
        space: string;
        tableName: string;
        tableId: string;
        viewId: string;
        docId?: undefined;
    } | {
        database: string;
        space: string;
        docId: string;
        tableName?: undefined;
        tableId?: undefined;
        viewId?: undefined;
    };
}
declare module "hooks/use-files" {
    import { IFile } from "worker/web-worker/meta-table/file";
    /**
     * every upload file will be record meta data in `eidos__files` table, but we can't pass file via postMessage,
     * so we expose this hook to handle file upload\delete\update
     * every mutation about file must be done via this hook.
     */
    export const useFileSystem: (rootDir?: FileSystemDirectoryHandle) => {
        isRootDir: boolean;
        entries: FileSystemFileHandle[];
        refresh: () => Promise<void>;
        addFiles: (files: File[], useUuId?: boolean) => Promise<IFile[]>;
        addDir: (name: string) => Promise<void>;
        uploadDir: (dirHandle: FileSystemDirectoryHandle, _parentPath?: string[]) => Promise<void>;
        enterDir: (dir: string) => void;
        backDir: () => void;
        currentPath: string[];
        enterPathByIndex: (index: number) => void;
        goRootDir: () => void;
        getFileUrlPath: (name: string) => string;
        deleteFiles: (names: {
            name: string;
            isDir: boolean;
        }[]) => Promise<void>;
        addSelectedEntry: (name: string, isDir: boolean) => void;
        removeSelectedEntry: (name: string) => void;
        selectedEntries: Map<string, boolean>;
        setSelectedEntries: (selectedEntries: Map<string, boolean>) => void;
        prevSelectedEntries: Map<string, boolean>;
        setPrevSelectedEntries: (prevSelectedEntries: Map<string, boolean>) => void;
    };
    export const useFiles: () => {
        files: IFile[];
    };
}
declare module "components/ui/aspect-ratio" {
    import * as AspectRatioPrimitive from "@radix-ui/react-aspect-ratio";
    const AspectRatio: import("react").ForwardRefExoticComponent<AspectRatioPrimitive.AspectRatioProps & import("react").RefAttributes<HTMLDivElement>>;
    export { AspectRatio };
}
declare module "components/ui/scroll-area" {
    import * as React from "react";
    import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
    const ScrollArea: React.ForwardRefExoticComponent<Omit<ScrollAreaPrimitive.ScrollAreaProps & React.RefAttributes<HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
    const ScrollBar: React.ForwardRefExoticComponent<Omit<ScrollAreaPrimitive.ScrollAreaScrollbarProps & React.RefAttributes<HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
    export { ScrollArea, ScrollBar };
}
declare module "components/ui/tabs" {
    import * as React from "react";
    import * as TabsPrimitive from "@radix-ui/react-tabs";
    const Tabs: React.ForwardRefExoticComponent<TabsPrimitive.TabsProps & React.RefAttributes<HTMLDivElement>>;
    const TabsList: React.ForwardRefExoticComponent<Omit<TabsPrimitive.TabsListProps & React.RefAttributes<HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
    const TabsTrigger: React.ForwardRefExoticComponent<Omit<TabsPrimitive.TabsTriggerProps & React.RefAttributes<HTMLButtonElement>, "ref"> & React.RefAttributes<HTMLButtonElement>>;
    const TabsContent: React.ForwardRefExoticComponent<Omit<TabsPrimitive.TabsContentProps & React.RefAttributes<HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
    export { Tabs, TabsList, TabsTrigger, TabsContent };
}
declare module "components/file-selector" {
    export const DefaultColors: string[];
    export function FileSelector(props: {
        onSelected: (url: string, close?: boolean) => void;
        onRemove: () => void;
        disableColor?: boolean;
        hideRemove?: boolean;
        height?: number;
        onlyImage?: boolean;
        hideGallery?: boolean;
    }): import("react/jsx-runtime").JSX.Element;
}
declare module "components/table/views/grid/store" {
    import { GridSelection, Rectangle } from "@glideapps/glide-data-grid";
    import { IField } from "lib/store/interface";
    interface IMenu {
        col: number;
        bounds: Rectangle;
    }
    interface ITableAppState {
        isAddFieldEditorOpen: boolean;
        setIsAddFieldEditorOpen: (isAddFieldEditorOpen: boolean) => void;
        isFieldPropertiesEditorOpen: boolean;
        setIsFieldPropertiesEditorOpen: (isFieldPropertiesEditorOpen: boolean) => void;
        selectedFieldType: string;
        setSelectedFieldType: (selectedFieldType: string) => void;
        selection: GridSelection;
        setSelection: (selection: GridSelection) => void;
        clearSelection: () => void;
        menu?: IMenu;
        setMenu: (menu?: IMenu) => void;
        currentUiColumn?: IField;
        setCurrentUiColumn: (currentUiColumn?: IField) => void;
        currentPreviewIndex: number;
        setCurrentPreviewIndex: (currentPreviewIndex: number) => void;
        addedRowIds: Set<string>;
        addAddedRowId: (rowId: string) => void;
        removeAddedRowId: (rowId: string) => void;
        clearAddedRowIds: () => void;
    }
    export const useTableAppStore: import("zustand").UseBoundStore<import("zustand").StoreApi<ITableAppState>>;
}
declare module "components/ui/command" {
    import * as React from "react";
    import { DialogProps } from "@radix-ui/react-dialog";
    const Command: React.ForwardRefExoticComponent<Omit<{
        children?: React.ReactNode;
    } & React.HTMLAttributes<HTMLDivElement> & {
        label?: string;
        shouldFilter?: boolean;
        filter?: (value: string, search: string) => number;
        value?: string;
        onValueChange?: (value: string) => void;
        loop?: boolean;
    } & React.RefAttributes<HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
    interface CommandDialogProps extends DialogProps {
    }
    const CommandDialog: ({ children, ...props }: CommandDialogProps) => import("react/jsx-runtime").JSX.Element;
    const CommandInput: React.ForwardRefExoticComponent<Omit<Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value"> & {
        value?: string;
        onValueChange?: (search: string) => void;
    } & React.RefAttributes<HTMLInputElement>, "ref"> & React.RefAttributes<HTMLInputElement>>;
    const CommandInput3: React.ForwardRefExoticComponent<Omit<Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value"> & {
        value?: string;
        onValueChange?: (search: string) => void;
    } & React.RefAttributes<HTMLInputElement>, "ref"> & React.RefAttributes<HTMLInputElement>>;
    /**
     * hidden search icon
     */
    const CommandInput2: React.ForwardRefExoticComponent<Omit<Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value"> & {
        value?: string;
        onValueChange?: (search: string) => void;
    } & React.RefAttributes<HTMLInputElement>, "ref"> & React.RefAttributes<HTMLInputElement>>;
    const CommandList: React.ForwardRefExoticComponent<Omit<{
        children?: React.ReactNode;
    } & React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
    const CommandEmpty: React.ForwardRefExoticComponent<Omit<{
        children?: React.ReactNode;
    } & React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
    const CommandGroup: React.ForwardRefExoticComponent<Omit<{
        children?: React.ReactNode;
    } & Omit<React.HTMLAttributes<HTMLDivElement>, "value" | "heading"> & {
        heading?: React.ReactNode;
        value?: string;
    } & React.RefAttributes<HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
    const CommandSeparator: React.ForwardRefExoticComponent<Omit<React.HTMLAttributes<HTMLDivElement> & {
        alwaysRender?: boolean;
    } & React.RefAttributes<HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
    const CommandItem: React.ForwardRefExoticComponent<Omit<{
        children?: React.ReactNode;
    } & Omit<React.HTMLAttributes<HTMLDivElement>, "value" | "disabled" | "onSelect"> & {
        disabled?: boolean;
        onSelect?: (value: string) => void;
        value?: string;
    } & React.RefAttributes<HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
    const CommandShortcut: {
        ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>): import("react/jsx-runtime").JSX.Element;
        displayName: string;
    };
    export { Command, CommandDialog, CommandInput, CommandInput2, CommandInput3, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut, CommandSeparator, };
}
declare module "components/table/views/grid/cells/link/link-cell-editor" {
    import { LinkCellData } from "lib/fields/link";
    interface IGridProps {
        tableName: string;
        databaseName: string;
        value: LinkCellData[];
        onChange: (data: LinkCellData[]) => void;
    }
    export function LinkCellEditor(props: IGridProps): import("react/jsx-runtime").JSX.Element;
}
declare module "components/table/views/grid/cells/link/link-cell" {
    import { CustomCell, CustomRenderer } from "@glideapps/glide-data-grid";
    import { LinkCellData } from "lib/fields/link";
    interface LinkCellProps {
        readonly kind: "link-cell";
        readonly value: LinkCellData[];
        readonly linkTable: string;
    }
    export type LinkCell = CustomCell<LinkCellProps>;
    export const linkCellRenderer: CustomRenderer<LinkCell>;
    export default linkCellRenderer;
}
declare module "lib/fields/link" {
    import { LinkCell } from "components/table/views/grid/cells/link/link-cell";
    import { BaseField } from "lib/fields/base";
    import { FieldType } from "lib/fields/const";
    export type ILinkProperty = {
        linkTableName: string;
        linkColumnName: string;
    };
    export type LinkCellData = {
        id: string;
        title: string;
        img?: string;
    };
    export class LinkField extends BaseField<LinkCell, ILinkProperty> {
        static type: FieldType;
        rawData2JSON(rawData: string): string;
        get compareOperators(): any[];
        getCellContent(rawData: string, context?: {
            row?: Record<string, string>;
        }): LinkCell;
        cellData2RawData(cell: LinkCell): {
            rawData: string;
        };
    }
}
declare module "components/table/views/grid/cells/helper" {
    import { BaseDrawArgs, BaseGridCell, Theme } from "@glideapps/glide-data-grid";
    import { LinkCellData } from "lib/fields/link";
    interface CornerRadius {
        tl: number;
        tr: number;
        bl: number;
        br: number;
    }
    export function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number | CornerRadius): void;
    export const removeItemFromArray: (_arr: any[], item: any) => any[];
    /** @category Drawing */
    export function getMiddleCenterBias(ctx: CanvasRenderingContext2D, font: string | Theme): number;
    /** @category Drawing */
    export function measureTextCached(s: string, ctx: CanvasRenderingContext2D, font?: string): TextMetrics;
    export function drawDrilldownCell(args: BaseDrawArgs, data: readonly LinkCellData[]): void;
    export function drawImage(args: BaseDrawArgs, data: readonly string[], rounding?: number, contentAlign?: BaseGridCell["contentAlign"]): void;
}
declare module "components/table/views/grid/cells/file/file-cell-eidtor" {
    import { type FC } from "react";
    export interface CardProps {
        id: any;
        text: string;
        originalUrl: string;
        index: number;
        moveCard: (dragIndex: number, hoverIndex: number) => void;
        setCurrentPreviewIndex: (i: number) => void;
        deleteByUrl: (index: number) => void;
    }
    export const Card: FC<CardProps>;
}
declare module "components/table/views/grid/cells/file/file-preview" {
    export const FilePreview: ({ url, type, onClose, }: {
        url: string;
        type: string;
        onClose: () => void;
    }) => import("react").ReactPortal;
}
declare module "components/table/views/grid/cells/file/file-cell" {
    import { CustomCell, CustomRenderer, ProvideEditorCallback } from "@glideapps/glide-data-grid";
    interface FileCellDataProps {
        readonly kind: "file-cell";
        readonly data: string[];
        readonly displayData: string[];
        readonly allowAdd?: boolean;
        readonly proxyUrl?: string;
    }
    export type FileCell = CustomCell<FileCellDataProps>;
    export const FileCellEditor: ReturnType<ProvideEditorCallback<FileCell & {
        className?: string;
    }>>;
    export const FileCellRenderer: CustomRenderer<FileCell>;
}
declare module "lib/fields/file" {
    import type { FileCell } from "components/table/views/grid/cells/file/file-cell";
    import { BaseField } from "lib/fields/base";
    import { CompareOperator, FieldType } from "lib/fields/const";
    export type FileProperty = {
        proxyUrl?: string;
    };
    export class FileField extends BaseField<FileCell, FileProperty, string> {
        static type: FieldType;
        rawData2JSON(rawData: string): string;
        get compareOperators(): CompareOperator[];
        static getDefaultFieldProperty(): {
            proxyUrl: string;
        };
        /**
         * we need to proxy the image to avoid CORS issue. if the image is a remote url, we will proxy it
         */
        getProxyData: (data: string[]) => string[];
        getCellContent(rawData: string): FileCell;
        cellData2RawData(cell: FileCell): {
            rawData: string;
        };
    }
}
declare module "lib/fields/formula" {
    import type { TextCell } from "@glideapps/glide-data-grid";
    import { BaseField } from "lib/fields/base";
    import { FieldType } from "lib/fields/const";
    export type FormulaProperty = {
        formula: string;
        displayType?: FieldType;
    };
    export class FormulaField extends BaseField<TextCell, FormulaProperty> {
        static type: FieldType;
        get compareOperators(): any[];
        rawData2JSON(rawData: string): string;
        getCellContent(rawData: string): TextCell;
        cellData2RawData(cell: TextCell): {
            rawData: string;
        };
    }
}
declare module "lib/fields/last-edited-by" {
    import { UserProfileCell } from "components/table/views/grid/cells/user-profile-cell";
    import { BaseField } from "lib/fields/base";
    import { CompareOperator, FieldType } from "lib/fields/const";
    import { UserFieldContext } from "lib/fields/created-by";
    type LastEditedByProperty = {};
    export class LastEditedByField extends BaseField<UserProfileCell, LastEditedByProperty, string, UserFieldContext> {
        static type: FieldType;
        rawData2JSON(rawData: string): string;
        get compareOperators(): CompareOperator[];
        getCellContent(rawData: string | undefined, context?: UserFieldContext): UserProfileCell;
        cellData2RawData(cell: UserProfileCell): {
            rawData: import("@/components/table/views/grid/cells/user-profile-cell").UserProfileCellProps;
        };
    }
}
declare module "lib/fields/last-edited-time" {
    import { TextCell } from "@glideapps/glide-data-grid";
    import { BaseField } from "lib/fields/base";
    import { CompareOperator, FieldType } from "lib/fields/const";
    type DateProperty = {};
    export class LastEditedTimeField extends BaseField<TextCell, DateProperty, string> {
        static type: FieldType;
        rawData2JSON(rawData: string): string;
        get compareOperators(): CompareOperator[];
        getCellContent(rawData: string | undefined): TextCell;
        cellData2RawData(cell: TextCell): {
            rawData: string;
        };
    }
}
declare module "lib/fields/lookup" {
    import { IField } from "lib/store/interface";
    import { BaseField } from "lib/fields/base";
    import { FieldType } from "lib/fields/const";
    import { ILinkProperty } from "lib/fields/link";
    export type ILookupProperty = {
        linkFieldId: string;
        lookupTargetFieldId: string;
    };
    /**
     * a -> b -> c -> d ....
     * if a&b&c&d are lookup field, we need to get the lookup fields map from a to d
     * walk through the lookup fields, and get the lookup fields map
     */
    export type ILookupContext = {
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
    export class LookupField extends BaseField<any, ILookupProperty, any, any, ILookupContext> {
        static type: FieldType;
        /**
         * get target field instance, no matter it is a lookup field or not
         * we will store all lookup cell data in database, if we want to get lookup cell data, we just need to get the target field
         * do not need to get the entity field instance
         * @returns
         */
        getTargetFieldInstance(): BaseField<any, any, any, any, any> | null;
        /**
         * for render, we need to get the entity field instance
         * a->b->c->d
         * maybe a&b&c are lookup field, but d is not a lookup field
         * we will get the target field recursively until the target field is not a lookup field
         * @returns
         */
        get entityFieldInstance(): BaseField<any, any, any, any, any> | LookupField | null;
        rawData2JSON(rawData: any): any;
        get compareOperators(): any;
        getCellContent(rawData: string, context: any): any;
        cellData2RawData(cell: any): {
            rawData: any;
        };
    }
}
declare module "components/table/cell-editor/common" {
    import { SelectOption } from "lib/fields/select";
    export const EmptyValue: () => import("react/jsx-runtime").JSX.Element;
    export const SelectOptionItem: ({ option, theme, }: {
        option: SelectOption;
        theme?: string;
    }) => import("react/jsx-runtime").JSX.Element;
}
declare module "components/table/views/grid/cells/select-cell" {
    import { CustomCell, CustomRenderer, ProvideEditorCallback } from "@glideapps/glide-data-grid";
    import { SelectOption } from "lib/fields/select";
    interface SelectCellProps {
        readonly kind: "select-cell";
        readonly value: string | null;
        readonly allowedValues: readonly SelectOption[];
        readonly readonly?: boolean;
    }
    export type SelectCell = CustomCell<SelectCellProps>;
    export const Editor: ReturnType<ProvideEditorCallback<SelectCell>>;
    const renderer: CustomRenderer<SelectCell>;
    export default renderer;
}
declare module "lib/fields/select" {
    import type { SelectCell } from "components/table/views/grid/cells/select-cell";
    import { BaseField } from "lib/fields/base";
    import { CompareOperator, FieldType } from "lib/fields/const";
    export type SelectOption = {
        id: string;
        name: string;
        color: string;
    };
    export type SelectProperty = {
        options: SelectOption[];
        defaultOption?: string;
    };
    export class SelectField extends BaseField<SelectCell, SelectProperty> {
        static type: FieldType;
        static colors: {
            light: {
                name: string;
                value: string;
            }[];
            dark: {
                name: string;
                value: string;
            }[];
        };
        static defaultColor: string;
        static colorNameValueMap: {
            light: Record<string, string>;
            dark: Record<string, string>;
        };
        static getColorValue(colorName: string, theme?: "light" | "dark"): string;
        get compareOperators(): CompareOperator[];
        get options(): SelectOption[];
        rawData2JSON(rawData: any): string;
        getCellContent(rawData: string): SelectCell;
        cellData2RawData(cell: SelectCell): {
            rawData: string;
            shouldUpdateColumnProperty?: undefined;
        } | {
            rawData: string;
            shouldUpdateColumnProperty: boolean;
        };
        static getDefaultFieldProperty(): {
            options: any[];
        };
        static generateOptionsByNames(names: string[]): {
            id: string;
            name: string;
            color: string;
        }[];
        changeOptionName(id: string, newName: string): void;
        changeOptionColor(id: string, newColor: string): void;
        addOption(name: string): SelectOption[];
        deleteOption(id: string): void;
    }
}
declare module "components/table/views/grid/cells/multi-select-cell" {
    import { CustomCell, CustomRenderer, ProvideEditorCallback } from "@glideapps/glide-data-grid";
    import { SelectOption } from "lib/fields/select";
    interface MultiSelectCellProps {
        readonly kind: "multi-select-cell";
        readonly values: readonly string[] | null;
        readonly readonly?: boolean;
        readonly allowedValues: readonly SelectOption[];
    }
    export type MultiSelectCell = CustomCell<MultiSelectCellProps>;
    export const Editor: ReturnType<ProvideEditorCallback<MultiSelectCell>>;
    const renderer: CustomRenderer<MultiSelectCell>;
    export default renderer;
}
declare module "lib/fields/multi-select" {
    import { MultiSelectCell } from "components/table/views/grid/cells/multi-select-cell";
    import { BaseField } from "lib/fields/base";
    import { CompareOperator, FieldType } from "lib/fields/const";
    import { SelectProperty } from "lib/fields/select";
    type MultiSelectProperty = SelectProperty;
    export class MultiSelectField extends BaseField<MultiSelectCell, MultiSelectProperty, string> {
        static type: FieldType;
        get compareOperators(): CompareOperator[];
        get type(): FieldType;
        get options(): import("@/lib/fields/select").SelectOption[];
        addOption(name: string): import("@/lib/fields/select").SelectOption[];
        rawData2JSON(rawData: string | null): string[];
        /**
         * in database we store the tags as a string, so we need to convert it to an array of strings
         * e.g. "tag1,tag2,tag3" => ["tag1", "tag2", "tag3"]
         * @param rawData
         * @returns
         */
        getCellContent(rawData: string): MultiSelectCell;
        /**
         * @param text tag1,tag2
         * return tag1id,tag2id
         */
        cellData2RawData(cell: MultiSelectCell): {
            rawData: any;
            shouldUpdateColumnProperty?: undefined;
        } | {
            rawData: string;
            shouldUpdateColumnProperty: boolean;
        };
        createFieldProperty(): {
            options: any[];
        };
    }
}
declare module "lib/fields/number" {
    import type { NumberCell } from "@glideapps/glide-data-grid";
    import { BaseField } from "lib/fields/base";
    import { CompareOperator, FieldType } from "lib/fields/const";
    type NumberProperty = {};
    export class NumberField extends BaseField<NumberCell, NumberProperty, number> {
        static type: FieldType;
        get compareOperators(): CompareOperator[];
        rawData2JSON(rawData: number): number;
        getCellContent(rawData: number | undefined): NumberCell;
        cellData2RawData(cell: NumberCell): {
            rawData: number;
        };
    }
}
declare module "components/table/views/grid/cells/rating-cell" {
    import { CustomCell, CustomRenderer } from "@glideapps/glide-data-grid";
    interface RatingCellProps {
        readonly kind: "rating-cell";
        readonly rating: number;
    }
    export type RatingCell = CustomCell<RatingCellProps>;
    const renderer: CustomRenderer<RatingCell>;
    export default renderer;
}
declare module "lib/fields/rating" {
    import type { RatingCell } from "components/table/views/grid/cells/rating-cell";
    import { BaseField } from "lib/fields/base";
    import { CompareOperator, FieldType } from "lib/fields/const";
    type RatingProperty = {};
    export class RatingField extends BaseField<RatingCell, RatingProperty, number> {
        static type: FieldType;
        get compareOperators(): CompareOperator[];
        rawData2JSON(rawData: number): number;
        getCellContent(rawData: number): RatingCell;
        cellData2RawData(cell: RatingCell): {
            rawData: number;
        };
    }
}
declare module "lib/fields/text" {
    import type { TextCell } from "@glideapps/glide-data-grid";
    import { BaseField } from "lib/fields/base";
    import { FieldType } from "lib/fields/const";
    type TextProperty = {};
    export class TextField extends BaseField<TextCell, TextProperty> {
        static type: FieldType;
        get compareOperators(): import("@/lib/fields/const").CompareOperator[];
        rawData2JSON(rawData: string): string;
        getCellContent(rawData: string | null): TextCell;
        cellData2RawData(cell: TextCell): {
            rawData: string;
        };
    }
}
declare module "lib/fields/title" {
    import type { TextCell } from "@glideapps/glide-data-grid";
    import { BaseField } from "lib/fields/base";
    import { CompareOperator, FieldType } from "lib/fields/const";
    type TitleProperty = {};
    export class TitleField extends BaseField<TextCell, TitleProperty> {
        static type: FieldType;
        get compareOperators(): CompareOperator[];
        rawData2JSON(rawData: string): string;
        getCellContent(rawData: string): TextCell;
        cellData2RawData(cell: TextCell): {
            rawData: string;
        };
    }
}
declare module "lib/fields/url" {
    import type { UriCell } from "@glideapps/glide-data-grid";
    import { BaseField } from "lib/fields/base";
    import { FieldType } from "lib/fields/const";
    type URLProperty = {};
    type URLCell = UriCell;
    export class URLField extends BaseField<URLCell, URLProperty> {
        static type: FieldType;
        get compareOperators(): import("@/lib/fields/const").CompareOperator[];
        rawData2JSON(rawData: string): string;
        getCellContent(rawData: string): URLCell;
        cellData2RawData(cell: URLCell): {
            rawData: string;
        };
    }
}
declare module "lib/fields/index" {
    import { IField } from "lib/store/interface";
    import { BaseField } from "lib/fields/base";
    import { CheckboxField } from "lib/fields/checkbox";
    import { FieldType } from "lib/fields/const";
    import { CreatedByField } from "lib/fields/created-by";
    import { CreatedTimeField } from "lib/fields/created-time";
    import { DateField } from "lib/fields/date";
    import { FileField } from "lib/fields/file";
    import { FormulaField } from "lib/fields/formula";
    import { LinkField } from "lib/fields/link";
    import { LookupField } from "lib/fields/lookup";
    import { MultiSelectField } from "lib/fields/multi-select";
    import { NumberField } from "lib/fields/number";
    import { RatingField } from "lib/fields/rating";
    import { SelectField } from "lib/fields/select";
    import { URLField } from "lib/fields/url";
    const baseFieldTypes: (typeof CheckboxField | typeof CreatedByField | typeof CreatedTimeField | typeof DateField | typeof LinkField | typeof FileField | typeof FormulaField | typeof SelectField | typeof MultiSelectField | typeof NumberField | typeof RatingField | typeof URLField)[];
    type FieldTypeAndClsMap = {
        [key in FieldType]: (typeof baseFieldTypes)[number];
    } & {
        [FieldType.Lookup]: typeof LookupField;
    };
    export const allFieldTypesMap: FieldTypeAndClsMap;
    export function getFieldInstance<T = BaseField<any, any, any, any, any>>(field: IField<any>, context?: any): T;
}
declare module "worker/web-worker/store" {
    export const workerStore: {
        currentCallUserId: string | null;
    };
}
declare module "worker/web-worker/sdk/rows" {
    import type { IField } from "lib/store/interface";
    import { DataSpace } from "worker/web-worker/DataSpace";
    import { TableManager } from "worker/web-worker/sdk/table";
    export class RowsManager {
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
            _last_edited_by: string;
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
            _last_edited_by: string;
            id: string;
        }>;
        /**
         * highlight the row if it is in the current view
         * @param id row id
         */
        highlight(id: string): Promise<void>;
    }
}
declare module "worker/web-worker/sdk/service/link" {
    import { Database } from "@sqlite.org/sqlite-wasm";
    import { FieldType } from "lib/fields/const";
    import { ILinkProperty } from "lib/fields/link";
    import { IField } from "lib/store/interface";
    import { DataSpace } from "worker/web-worker/DataSpace";
    import { TableManager } from "worker/web-worker/sdk/table";
    interface IRelation {
        self: string;
        ref: string;
        link_field_id: string;
    }
    export class LinkFieldService {
        private table;
        dataSpace: DataSpace;
        db: Database;
        constructor(table: TableManager);
        getEffectRowsByRelationDeleted: (relationTableName: string, relation: IRelation, db?: Database) => Promise<{
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
        getEffectRows: (table_name: string, rowIds: string[], db?: Database) => Promise<Record<string, string[]>>;
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
        addField: (data: IField<ILinkProperty>, db?: Database) => Promise<Database>;
        /**
         * when user delete a table, we need check if there are link fields in the table, if so, we need to delete the paired link field and delete relation table and delete trigger
         */
        beforeDeleteTable(tableName: string, db?: Database): Promise<void>;
        /**
         * when user delete a link field, we also need to delete the paired link field and delete relation data
         */
        beforeDeleteColumn(tableName: string, columnName: string, db?: Database): Promise<void>;
    }
}
declare module "worker/web-worker/sdk/service/lookup" {
    import { Database } from "@sqlite.org/sqlite-wasm";
    import { ILookupContext, ILookupProperty } from "lib/fields/lookup";
    import { IField } from "lib/store/interface";
    import { DataSpace } from "worker/web-worker/DataSpace";
    import { TableManager } from "worker/web-worker/sdk/table";
    export class LookupFieldService {
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
        }>;
        _getLookupContext: (tableName: string, tableColumnName: string) => Promise<{
            targetTableColumnName: string;
            targetTableName: string;
            linkFieldId: string;
        }>;
        getFieldContext: (tableName: string, tableColumnName: string) => Promise<{
            targetTableColumnName: string;
            targetTableName: string;
            linkFieldId: string;
        }>;
        /**
         *
         * @param id table_column_name
         */
        updateColumn: (data: {
            tableName: string;
            tableColumnName: string;
            db?: Database;
            rowIds?: string[];
        }) => Promise<void>;
    }
}
declare module "worker/web-worker/sdk/service/multi-select" {
    import { SelectProperty } from "lib/fields/select";
    import { IField } from "lib/store/interface";
    import { DataSpace } from "worker/web-worker/DataSpace";
    import { TableManager } from "worker/web-worker/sdk/table";
    export class MultiSelectFieldService {
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
}
declare module "worker/web-worker/sdk/service/select" {
    import { SelectProperty } from "lib/fields/select";
    import { IField } from "lib/store/interface";
    import { DataSpace } from "worker/web-worker/DataSpace";
    import { TableManager } from "worker/web-worker/sdk/table";
    export class SelectFieldService {
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
        beforeConvert: (field: IField<any>, db?: import("@sqlite.org/sqlite-wasm").Database) => Promise<{
            id: string;
            name: string;
            color: string;
        }[]>;
    }
}
declare module "worker/web-worker/sdk/service/index" {
    import { DataSpace } from "worker/web-worker/DataSpace";
    import { TableManager } from "worker/web-worker/sdk/table";
    import { LinkFieldService } from "worker/web-worker/sdk/service/link";
    import { LookupFieldService } from "worker/web-worker/sdk/service/lookup";
    import { MultiSelectFieldService } from "worker/web-worker/sdk/service/multi-select";
    import { SelectFieldService } from "worker/web-worker/sdk/service/select";
    export class FieldsManager {
        private table;
        dataSpace: DataSpace;
        constructor(table: TableManager);
        get lookup(): LookupFieldService;
        get select(): SelectFieldService;
        get multiSelect(): MultiSelectFieldService;
        get link(): LinkFieldService;
    }
}
declare module "worker/web-worker/sdk/service/compute" {
    import { DataSpace } from "worker/web-worker/DataSpace";
    export class ComputeService {
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
}
declare module "worker/web-worker/sdk/table" {
    import { Database } from "@sqlite.org/sqlite-wasm";
    import { IView } from "lib/store/IView";
    import { DataSpace } from "worker/web-worker/DataSpace";
    import { IndexManager } from "worker/web-worker/sdk/index-manager";
    import { RowsManager } from "worker/web-worker/sdk/rows";
    import { FieldsManager } from "worker/web-worker/sdk/service/index";
    import { ComputeService } from "worker/web-worker/sdk/service/compute";
    interface ITable {
        id: string;
        name: string;
        views: IView[];
    }
    export class TableManager {
        id: string;
        dataSpace: DataSpace;
        rawTableName: string;
        db: Database | null;
        constructor(id: string, dataSpace: DataSpace);
        startTransaction(db: Database): void;
        get compute(): ComputeService;
        get rows(): RowsManager;
        get fields(): FieldsManager;
        get index(): IndexManager;
        isExist(id: string): Promise<boolean>;
        get(id: string): Promise<ITable | null>;
        del(id: string): Promise<boolean>;
        hasSystemColumn(tableId: string, column: string): Promise<any>;
        fixTable(tableId: string): Promise<void>;
    }
}
declare module "worker/web-worker/data-pipeline/DataChangeEventHandler" {
    import { DataSpace } from "worker/web-worker/DataSpace";
    export class DataChangeEventHandler {
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
}
declare module "worker/web-worker/data-pipeline/DataChangeTrigger" {
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
        unRegisterTrigger(space: string, tableName: string): Promise<void>;
        isTriggerChanged(space: string, tableName: string, trigger: IRegisterTrigger): boolean;
        setTrigger(db: DataSpace, tableName: string, collist: any[], toDeleteColumns?: string[]): Promise<void>;
    }
}
declare module "worker/web-worker/data-pipeline/LinkRelationUpdater" {
    import { DataSpace } from "worker/web-worker/DataSpace";
    export class LinkRelationUpdater {
        private dataSpace;
        needUpdateCell: Record<string, Record<string, Set<string>>>;
        constructor(dataSpace: DataSpace, setInterval?: typeof global.setInterval);
        updateCells: () => Promise<void>;
        addCell: (tableName: string, tableColumnName: string, rowId: string) => void;
    }
}
declare module "worker/web-worker/data-pipeline/UndoRedo" {
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
        triggerNames: string[];
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
declare module "worker/web-worker/db-migrator/DbMigrator" {
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
        private cleanDraftDb;
    }
}
declare module "worker/web-worker/helper" {
    export function timeit(threshold: number): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor;
}
declare module "worker/web-worker/import-and-export/base" {
    import { DataSpace } from "worker/web-worker/DataSpace";
    export abstract class BaseImportAndExport {
        abstract import(file: File, dataSpace: DataSpace): Promise<string>;
        abstract export(nodeId: string, dataSpace: DataSpace): Promise<File>;
    }
}
declare module "worker/web-worker/import-and-export/csv" {
    import { DataSpace } from "worker/web-worker/DataSpace";
    import { BaseImportAndExport } from "worker/web-worker/import-and-export/base";
    export class CsvImportAndExport extends BaseImportAndExport {
        guessColumnType(file: File): Promise<{
            [name: string]: "String" | "Number" | "Date";
        }>;
        import(file: File, dataSpace: DataSpace): Promise<string>;
        export(nodeId: string, dataSpace: DataSpace): Promise<File>;
    }
}
declare module "worker/web-worker/import-and-export/markdown" {
    import { DataSpace } from "worker/web-worker/DataSpace";
    import { BaseImportAndExport } from "worker/web-worker/import-and-export/base";
    export class MarkdownImportAndExport extends BaseImportAndExport {
        import(file: File, dataSpace: DataSpace): Promise<string>;
        export(nodeId: string, dataSpace: DataSpace): Promise<File>;
    }
}
declare module "worker/web-worker/meta-table/action" {
    import { BaseTable, BaseTableImpl } from "worker/web-worker/meta-table/base";
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
    }
}
declare module "lib/sqlite/sql-alter-column-type" {
    /**
     * 1. add new column with new type
     * 2. copy data from old column to new column
     * 3. rename old column to old column + "_old"
     * 4. rename new column to old column
     * 5. drop old column
     * @param tableName
     * @param columnName
     * @param newType
     */
    export const alterColumnType: (tableName: string, columnName: string, newType: "TEXT" | "REAL" | "INT") => string;
}
declare module "worker/web-worker/meta-table/column" {
    import { FieldType } from "lib/fields/const";
    import { IField } from "lib/store/interface";
    import { BaseTable, BaseTableImpl } from "worker/web-worker/meta-table/base";
    /**
     * define
     * 1. column: a real column in table
     * 2. field: a wrapper of column, with some additional properties which control the UI behavior
     *
     * this table is used to manage the mapping between column and field
     */
    export class ColumnTable extends BaseTableImpl implements BaseTable<IField> {
        name: string;
        createTableSql: string;
        JSONFields: string[];
        static getColumnTypeByFieldType(type: FieldType): any;
        add(data: IField): Promise<IField>;
        getColumn<T = any>(tableName: string, tableColumnName: string): Promise<IField<T> | null>;
        set(id: string, data: Partial<IField>): Promise<boolean>;
        del(id: string): Promise<boolean>;
        deleteField(tableName: string, tableColumnName: string): Promise<string[]>;
        /**
         * @param tableName tb_<uuid>
         */
        deleteByRawTableName(tableName: string, db?: import("@sqlite.org/sqlite-wasm").Database): Promise<void>;
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
}
declare module "worker/web-worker/meta-table/doc" {
    import { Email } from "postal-mime";
    import { BaseTable, BaseTableImpl } from "worker/web-worker/meta-table/base";
    export interface IDoc {
        id: string;
        content: string;
        markdown: string;
        is_day_page?: boolean;
        created_at?: string;
        updated_at?: string;
    }
    export class DocTable extends BaseTableImpl implements BaseTable<IDoc> {
        name: string;
        createTableSql: string;
        rebuildIndex(refillNullMarkdown?: boolean): Promise<void>;
        listAllDayPages(): Promise<any>;
        listDayPage(page?: number): Promise<any>;
        del(id: string): Promise<boolean>;
        getMarkdown(id: string): Promise<string>;
        getBaseInfo(id: string): Promise<Partial<IDoc>>;
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
        createOrUpdate(data: {
            id: string;
            text: string | Email;
            type: "html" | "markdown" | "email";
            mode?: "replace" | "append";
        }): Promise<{
            id: string;
            success: boolean;
            msg?: undefined;
        } | {
            id: string;
            success: boolean;
            msg: string;
        }>;
        static mergeState: (oldState: string, newState: string) => string;
        _createOrUpdate(id: string, content: string, markdown: string, mode?: "replace" | "append"): Promise<{
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
declare module "worker/web-worker/meta-table/embedding" {
    import { BaseTable, BaseTableImpl } from "worker/web-worker/meta-table/base";
    export interface IEmbedding {
        id: string;
        embedding: string;
        model: string;
        raw_content: string;
        source_type: "doc" | "table" | "file";
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
declare module "worker/web-worker/meta-table/reference" {
    import { IField } from "lib/store/interface";
    import { BaseTable, BaseTableImpl } from "worker/web-worker/meta-table/base";
    export interface IReference {
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
    export class ReferenceTable extends BaseTableImpl implements BaseTable<IReference> {
        del(id: string): Promise<boolean>;
        name: string;
        createTableSql: string;
        getEffectedFields: (table_name: string, table_column_name: string) => Promise<IField[]>;
    }
}
declare module "worker/web-worker/meta-table/script" {
    import { JsonSchema7ObjectType } from "zod-to-json-schema/src/parsers/object";
    import { BaseTable, BaseTableImpl } from "worker/web-worker/meta-table/base";
    export type ScriptStatus = "all" | "enabled" | "disabled";
    export interface ICommand {
        name: string;
        description: string;
        inputJSONSchema?: JsonSchema7ObjectType;
        outputJSONSchema?: JsonSchema7ObjectType;
        asTableAction?: boolean;
    }
    export interface IPromptConfig {
        model?: string;
        actions?: string[];
    }
    export interface IScript {
        id: string;
        name: string;
        type: "script" | "udf" | "prompt" | "block" | "app";
        description: string;
        version: string;
        code: string;
        ts_code?: string;
        enabled?: boolean;
        model?: string;
        prompt_config?: IPromptConfig;
        commands: ICommand[];
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
        env_map?: {
            [key: string]: string;
        };
        fields_map?: {
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
        JSONFields: string[];
        del(id: string): Promise<boolean>;
        enable(id: string): Promise<boolean>;
        disable(id: string): Promise<boolean>;
        updateEnvMap(id: string, env_map: {
            [key: string]: string;
        }): Promise<boolean>;
    }
}
declare module "worker/web-worker/meta-table/tree" {
    import { ITreeNode } from "lib/store/ITreeNode";
    import { BaseTable, BaseTableImpl } from "worker/web-worker/meta-table/base";
    export class TreeTable extends BaseTableImpl implements BaseTable<ITreeNode> {
        name: string;
        createTableSql: string;
        getNextRowId: () => Promise<any>;
        add(data: ITreeNode): Promise<ITreeNode>;
        get(id: string): Promise<ITreeNode | null>;
        updateName(id: string, name: string): Promise<boolean>;
        pin(id: string, is_pinned: boolean): Promise<boolean>;
        del(id: string, db?: import("@sqlite.org/sqlite-wasm").Database): Promise<boolean>;
        makeProxyRow(row: any): ITreeNode;
        query(qs: {
            query?: string;
            withSubNode?: boolean;
        }): Promise<ITreeNode[]>;
        moveIntoTable(id: string, tableId: string, parentId?: string): Promise<boolean>;
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
    }
}
declare module "lib/sqlite/sql-parser" {
    export const getColumnsFromQuery: (sql?: string) => import("pgsql-ast-parser").SelectedColumn[];
    export const replaceQueryTableName: (query: string, tableNameMap: Record<string, string>) => string;
    export const replaceWithFindIndexQuery: (query: string, rowId: string) => string;
    /**
     * transform sql query replace column name with columnNameMap
     * @param sql
     * @param columnNameMap
     * @returns transformed sql
     */
    export const transformSql: (sql: string, rawTableName: string, columnNameMap: Map<string, string>) => string;
}
declare module "worker/web-worker/meta-table/view" {
    import { IView } from "lib/store/IView";
    import { BaseTable, BaseTableImpl } from "worker/web-worker/meta-table/base";
    export class ViewTable extends BaseTableImpl implements BaseTable<IView> {
        name: string;
        createTableSql: string;
        JSONFields: string[];
        add(data: IView): Promise<IView>;
        del(id: string): Promise<boolean>;
        deleteByTableId(table_id: string, db?: import("@sqlite.org/sqlite-wasm").Database): Promise<void>;
        updateQuery(id: string, query: string): Promise<void>;
        createDefaultView(table_id: string): Promise<IView<any>>;
        isRowExistInQuery(table_id: string, rowId: string, query: string): Promise<boolean>;
        findRowIndexInQuery(table_id: string, rowId: string, query: string): Promise<number>;
        recompute(table_id: string, rowIds: string[]): Promise<any>;
    }
}
declare module "worker/web-worker/udf/index" {
    import { ScalarFunctionOptions, Sqlite3Static } from "@sqlite.org/sqlite-wasm";
    export const withSqlite3AllUDF: (sqlite3: Sqlite3Static) => (ScalarFunctionOptions | {
        name: string;
        xFunc: (pCx: any, table: any, _new: any, _old: any) => void;
    })[];
}
declare module "worker/web-worker/DataSpace" {
    import { Database, Sqlite3Static } from "@sqlite.org/sqlite-wasm";
    import { FieldType } from "lib/fields/const";
    import { FileSystemType } from "lib/storage/eidos-file-system";
    import { ITreeNode } from "lib/store/ITreeNode";
    import { IView } from "lib/store/IView";
    import { IField } from "lib/store/interface";
    import { DataChangeEventHandler } from "worker/web-worker/data-pipeline/DataChangeEventHandler";
    import { DataChangeTrigger } from "worker/web-worker/data-pipeline/DataChangeTrigger";
    import { LinkRelationUpdater } from "worker/web-worker/data-pipeline/LinkRelationUpdater";
    import { SQLiteUndoRedo } from "worker/web-worker/data-pipeline/UndoRedo";
    import { ActionTable } from "worker/web-worker/meta-table/action";
    import { BaseTable } from "worker/web-worker/meta-table/base";
    import { ColumnTable } from "worker/web-worker/meta-table/column";
    import { DocTable } from "worker/web-worker/meta-table/doc";
    import { EmbeddingTable, IEmbedding } from "worker/web-worker/meta-table/embedding";
    import { FileTable, IFile } from "worker/web-worker/meta-table/file";
    import { ReferenceTable } from "worker/web-worker/meta-table/reference";
    import { IScript, ScriptStatus, ScriptTable } from "worker/web-worker/meta-table/script";
    import { TreeTable } from "worker/web-worker/meta-table/tree";
    import { ViewTable } from "worker/web-worker/meta-table/view";
    import { TableManager } from "worker/web-worker/sdk/table";
    export type EidosTable = DocTable | ActionTable | ScriptTable | TreeTable | ViewTable | ColumnTable | EmbeddingTable | FileTable;
    export class DataSpace {
        db: Database;
        draftDb: DataSpace | undefined;
        sqlite3: Sqlite3Static | undefined;
        undoRedoManager: SQLiteUndoRedo;
        activeUndoManager: boolean;
        dbName: string;
        doc: DocTable;
        action: ActionTable;
        script: ScriptTable;
        tree: TreeTable;
        view: ViewTable;
        column: ColumnTable;
        reference: ReferenceTable;
        embedding: EmbeddingTable;
        file: FileTable;
        dataChangeTrigger: DataChangeTrigger;
        linkRelationUpdater: LinkRelationUpdater;
        allTables: BaseTable<any>[];
        eventHandler: DataChangeEventHandler;
        hasMigrated: boolean;
        constructor(config: {
            db: Database;
            activeUndoManager: boolean;
            dbName: string;
            context: {
                setInterval?: typeof setInterval;
            };
            createUDF?: (db: Database) => void;
            sqlite3?: Sqlite3Static;
            draftDb?: DataSpace;
        });
        closeDb(): void;
        private initUDF;
        private initMetaTable;
        onTableChange(space: string, tableName: string, toDeleteColumns?: string[]): Promise<void>;
        addEmbedding(embedding: IEmbedding): Promise<IEmbedding>;
        table(id: string): TableManager;
        createTableIndex(tableId: string, column: string): void;
        getLookupContext(tableName: string, columnName: string): Promise<import("@/lib/fields/lookup").ILookupContext>;
        updateLookupColumn(tableName: string, columnName: string): Promise<void>;
        deleteSelectOption: (field: IField, option: string) => Promise<void>;
        updateSelectOptionName: (field: IField, update: {
            from: string;
            to: string;
        }) => Promise<void>;
        setRow(tableId: string, rowId: string, data: any): Promise<{
            _last_edited_time: string;
            _last_edited_by: string;
            id: string;
        }>;
        setCell(data: {
            tableId: string;
            rowId: string;
            fieldId: string;
            value: any;
        }): Promise<void>;
        getRow(tableId: string, rowId: string): Promise<Record<string, any>>;
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
        addFile(file: IFile): Promise<IFile>;
        uploadDir(dirHandle: FileSystemDirectoryHandle, _parentPath?: string[]): Promise<void>;
        getFileById(id: string): Promise<IFile>;
        getFileByPath(path: string): Promise<IFile>;
        delFile(id: string): Promise<boolean>;
        delFileByPath(path: string): Promise<boolean>;
        deleteFileByPathPrefix(prefix: string): Promise<boolean>;
        updateFileVectorized(id: string, isVectorized: boolean): Promise<boolean>;
        saveFile2EFS(url: string, subDir?: string[], name?: string): Promise<IFile>;
        listFiles(): Promise<any[]>;
        walkFiles(): Promise<any[]>;
        transformFileSystem(sourceFs: FileSystemType, targetFs: FileSystemType): Promise<void>;
        listViews(tableId: string): Promise<any[]>;
        addView(view: IView): Promise<IView<any>>;
        delView(viewId: string): Promise<boolean>;
        updateView(viewId: string, view: Partial<IView>): Promise<boolean>;
        createDefaultView(tableId: string): Promise<IView<any>>;
        isRowExistInQuery(tableId: string, rowId: string, query: string): Promise<boolean>;
        getRecomputeRows(tableId: string, rowIds: string[]): Promise<any>;
        addColumn(data: IField): Promise<IField>;
        deleteField(tableName: string, tableColumnName: string): Promise<string[]>;
        changeColumnType(tableName: string, columnName: string, type: FieldType): Promise<void>;
        listRawColumns(tableName: string): Promise<{
            [columnName: string]: import("@sqlite.org/sqlite-wasm").SqlValue;
        }[]>;
        updateColumnProperty(data: {
            tableName: string;
            tableColumnName: string;
            property: any;
            type: FieldType;
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
        getDocBaseInfo(id: string): Promise<Partial<import("@/worker/web-worker/meta-table/doc").IDoc>>;
        updateDoc(docId: string, content: string, markdown: string, _isDayPage?: boolean): Promise<void>;
        getDoc(docId: string): Promise<any>;
        getDocMarkdown(docId: string): Promise<string>;
        /**
         * if you want to create or update a day page, you should pass a day page id. page id is like 2021-01-01
         * @param docId
         * @param mdStr
         * @param parent_id
         * @returns
         */
        createOrUpdateDocWithMarkdown(docId: string, mdStr: string, parent_id?: string, title?: string): Promise<{
            id: string;
            success: boolean;
            msg?: undefined;
        } | {
            id: string;
            success: boolean;
            msg: string;
        }>;
        createOrUpdateDoc(data: {
            docId: string;
            content: string;
            type: "html" | "markdown" | "email";
            parent_id?: string;
            title?: string;
            mode?: "replace" | "append";
        }): Promise<{
            id: string;
            success: boolean;
            msg?: undefined;
        } | {
            id: string;
            success: boolean;
            msg: string;
        }>;
        deleteDoc(docId: string): Promise<void>;
        listAllDocIds(): Promise<any[]>;
        fullTextSearch(query: string): Promise<{
            id: string;
            result: string;
        }[]>;
        createTable(id: string, name: string, tableSchema: string, parent_id?: string): Promise<void>;
        importCsv(file: File): Promise<string>;
        exportCsv(tableId: string): Promise<File>;
        importMarkdown(file: File): Promise<string>;
        exportMarkdown(nodeId: string): Promise<File>;
        fixTable(tableId: string): Promise<void>;
        hasSystemColumn(tableId: string, column: string): Promise<any>;
        restoreNode(id: string): Promise<void>;
        deleteNode(id: string): Promise<void>;
        isTableExist(id: string): Promise<boolean>;
        deleteTable(id: string): Promise<void>;
        listDays(page: number): Promise<any>;
        listAllDays(): Promise<any>;
        syncExec2(sql: string, bind?: any[], db?: Database): any;
        exec2(sql: string, bind?: any[]): Promise<any>;
        runAIgeneratedSQL(sql: string, tableName: string): Promise<Record<string, any>[]>;
        listTreeNodes(query?: string, withSubNode?: boolean): Promise<ITreeNode[]>;
        updateTreeNodePosition(id: string, position: number): Promise<boolean>;
        pinNode(id: string, isPinned: boolean): Promise<boolean>;
        toggleNodeFullWidth(id: string, isFullWidth: boolean): Promise<boolean>;
        toggleNodeLock(id: string, isLocked: boolean): Promise<boolean>;
        updateTreeNodeName(id: string, name: string): Promise<void>;
        addTreeNode(data: ITreeNode): Promise<ITreeNode>;
        getOrCreateTreeNode(data: ITreeNode): Promise<ITreeNode>;
        getTreeNode(id: string): Promise<ITreeNode>;
        moveDraftIntoTable(id: string, tableId: string, parentId?: string): Promise<boolean>;
        nodeChangeParent(id: string, parentId?: string, opts?: {
            targetId: string;
            targetDirection: "up" | "down";
        }): Promise<Partial<ITreeNode>>;
        listUiColumns(tableName: string): Promise<IField[]>;
        /**
         * this will return all ui columns in this space
         * @param tableName
         * @returns
         */
        listAllUiColumns(): Promise<any>;
        undo(): void;
        redo(): void;
        private activeTablesUndoRedo;
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
        sql(strings: TemplateStringsArray, ...values: any[]): Promise<any>;
        sql2: (strings: TemplateStringsArray, ...values: any[]) => Promise<any>;
        sqlQuery: (sql: string, bind?: any[], rowMode?: "object" | "array") => Promise<any>;
        /**
         * Symbol can't be transformed between main thread and worker thread.
         * so we need to parse sql in main thread, then call this function. it will equal to call `sql` function in worker thread
         * be careful, it just parse sql before, the next logic need to be same with `sql` function
         * @param sql
         * @param bind
         * @returns
         */
        sql4mainThread(sql: string, bind?: any[], rowMode?: "object" | "array"): Promise<any>;
        sql4mainThread2(sql: string, bind?: any[]): Promise<any>;
        onUpdate(): void;
        notify(msg: {
            title: string;
            description: string;
        }): void;
        blockUIMsg(msg: string | null, data?: Record<string, any>): void;
    }
}
declare module "@eidos.space/types" {
    import { DataSpace } from "worker/web-worker/DataSpace";
    export interface Eidos {
        space(spaceName: string): DataSpace;
        currentSpace: DataSpace;
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
    export interface EidosTable<T = Record<string, string>> {
        id: string;
        name: string;
        fieldsMap: T;
    }
}
