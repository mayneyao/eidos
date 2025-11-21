import type { JsonSchema7ObjectType } from "zod-to-json-schema"

export type ExtensionStatus = "all" | "enabled" | "disabled"


export type BindingType = "table" | "secret" | "text"

export type ExtensionMeta =
    | TableViewMeta
    | ExtNodeMeta
    | FileHandlerMeta
    | ToolMeta
    | TableActionMeta
    | DocActionMeta
    | FileActionMeta
    | UDFMeta


export type IBinding = {
    type: BindingType
    value: string
}

export type IBindings = Record<string, IBinding>

export interface IExtension<T extends ExtensionMeta = ExtensionMeta> {
    // system-generated id
    id: string
    slug: string
    name: string
    type: "script" | "block"
    description: string
    version: string
    code: string
    meta?: T
    // icon is a data uri of an image
    icon?: string
    // if the script is published to marketplace, it will have a marketplace_id
    marketplace_id?: string
    ts_code?: string
    enabled?: boolean
    bindings?: IBindings
    created_at?: string
    updated_at?: string
}


export enum ScriptExtensionType {
    TableAction = "tableAction",
    DocAction = "docAction",
    FileAction = "fileAction",
    Tool = "tool",
    UDF = "udf",
}

export enum BlockExtensionType {
    TableView = "tableView",
    ExtNode = "extNode",
    FileHandler = "fileHandler",
}


// Block Extension Meta Configurations
export interface TableViewMeta {
    type: BlockExtensionType.TableView
    componentName: string
    tableView: {
        title: string
        // the type of the view. built-in types are: grid, gallery, kanban.
        type: string
        description: string
    }
}

export interface ExtNodeMeta {
    type: BlockExtensionType.ExtNode
    componentName: string
    extNode: {
        title: string
        description: string
        // extended type of the node
        type: string
    }
}

export interface FileHandlerMeta {
    type: BlockExtensionType.FileHandler
    componentName: string
    fileHandler: {
        title: string
        description: string
        extensions: string[]
        icon?: string
    }
}



// Script Extension Meta Configurations
export interface ToolMeta {
    type: ScriptExtensionType.Tool
    funcName: string
    tool: {
        name: string
        description: string
        inputJSONSchema: JsonSchema7ObjectType
        outputJSONSchema: JsonSchema7ObjectType
    }
}

export interface TableActionMeta {
    type: ScriptExtensionType.TableAction
    funcName: string
    tableAction: {
        name: string
        description: string
    }
}

export interface DocActionMeta {
    type: ScriptExtensionType.DocAction
    funcName: string
    docAction: {
        name: string
        description: string
    }
}

export interface FileActionMeta {
    type: ScriptExtensionType.FileAction
    funcName: string
    fileAction: {
        name: string
        description: string
        extensions: string[]
        icon?: string
    }
}

export interface UDFMeta {
    type: ScriptExtensionType.UDF
    funcName: string
    udf: {
        name: string
        deterministic?: boolean
    }
}



// Context interfaces for different extension types
export interface ITableViewContext {
    tableId: string
    viewId: string
}

export interface ITableActionContext {
    tableId: string
    viewId: string
    rowId: string
}

export interface IDocActionContext {
    docId: string
    databaseId: string
}

// Block Extension interfaces
export interface IBlockExtension extends Omit<IExtension, 'type' | 'meta'> {
    type: "block"
    meta: TableViewMeta | ExtNodeMeta | FileHandlerMeta
}

// Script Extension interfaces
export interface IScriptExtension extends Omit<IExtension, 'type' | 'meta'> {
    type: "script"
    meta: ToolMeta | TableActionMeta | DocActionMeta | FileActionMeta | UDFMeta
}

