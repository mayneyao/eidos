// https://gist.github.com/mizchi/cb572eae55154ec781ced5c111621939
// unofficial sqlite3 types.
// These are typed only for my scope

declare module "@sqlite.org/sqlite-wasm" {
  type InitOptions = {
    print: (...msg: any[]) => void
    printErr: (...msg: any[]) => void
  }

  type PreparedStatement = {
    db: DatabaseApi
    bind(value: any): PreparedStatement
    bind(idx: number, value: any): PreparedStatement
    bindAsBlob(value: any): any
    bindAsBlob(idx: number, value: any): any
    get(ndx: number, asType?: any): any

    finalize(): any
    stepFinalize(): boolean

    // TODO
    columnCount: any
    parameterCount: any
    clearBindings: any
    reset: any
    step: any
    stepReset: any
    getInt: any
    getFloat: any
    getString: any
    getBlob: any
    getJSON: any
    getColumnName: any
    getColumnNames: any
    getParamIndex: any
    pointer: number
  }
  type ExecOptions = {
    sql?: string
    bind?: Array<string | number>
    saveSql?: Array<any>
    returnValue?: "this" | "resultRows"
    callback?: (result: any, stmt: PreparedStatement) => void
  }

  type ExecThisOptions = ExecOptions & {
    returnValue?: "this" | undefined
  }

  type ExecResultRowsOptions = ExecOptions & {
    returnValue: "resultRows"
    rowMode?: "array" | "object" | "stmt"
  }

  type DatabaseApi = {
    filename: string
    pointer: number
    exec(input: string, opts?: ExecThisOptions): DatabaseApi
    exec(input: string, opts?: ExecResultRowsOptions): any

    exec(opts: ExecThisOptions): DatabaseApi
    exec(opts: ExecResultRowsOptions): any

    // exec(opts: ExecOptions & {returnValue: "resultRows"}): any;
    prepare(sql: string): PreparedStatement

    isOpen: () => boolean
    affirmOpen: () => DatabaseApi
    close: () => void
    changes: (total?: boolean, sixtyFour?: boolean) => number
    dbFilename: () => string
    dbName: () => string
    dbVfsName: (dbName: any) => string
    createFunction: Function

    selectValue: Function
    selectValues: Function
    selectArray: Function
    selectObject: Function
    selectArrays: Function
    selectObjects: Function

    openStatementCount: Function
    transaction: Function
    savepoint: Function
    checkRc: Function
  }

  export class JsStorageDb implements DatabaseApi {
    constructor(mode: "local" | "session")
    filename: string
    pointer: number
    exec(input: string, opts?: ExecThisOptions | undefined): DatabaseApi
    exec(input: string, opts?: ExecResultRowsOptions | undefined)
    exec(opts: ExecThisOptions): DatabaseApi
    exec(opts: ExecResultRowsOptions)
    prepare(sql: string): PreparedStatement
    isOpen: () => boolean
    affirmOpen: () => DatabaseApi
    close: () => void
    changes: (
      total?: boolean | undefined,
      sixtyFour?: boolean | undefined
    ) => number
    dbFilename: () => string
    dbName: () => string
    dbVfsName: (dbName: any) => string
    createFunction: Function
    selectValue: Function
    selectValues: Function
    selectArray: Function
    selectObject: Function
    selectArrays: Function
    selectObjects: Function
    openStatementCount: Function
    transaction: Function
    savepoint: Function
    checkRc: Function
    storageSize(): number
    clearStorage(): void
  }

  export class OpfsDatabase implements DatabaseApi {
    constructor(filename: string, flag?: string)
    filename: string
    pointer: number
    exec(input: string, opts?: ExecThisOptions | undefined): DatabaseApi
    exec(input: string, opts?: ExecResultRowsOptions | undefined)
    exec(opts: ExecThisOptions): DatabaseApi
    exec(opts: ExecResultRowsOptions)
    prepare(sql: string): PreparedStatement
    isOpen: () => boolean
    affirmOpen: () => DatabaseApi
    close: () => void
    changes: (
      total?: boolean | undefined,
      sixtyFour?: boolean | undefined
    ) => number
    dbFilename: () => string
    dbName: () => string
    dbVfsName: (dbName: any) => string
    createFunction: Function
    selectValue: Function
    selectValues: Function
    selectArray: Function
    selectObject: Function
    selectArrays: Function
    selectObjects: Function
    openStatementCount: Function
    transaction: Function
    savepoint: Function
    checkRc: Function
  }

  export type Flags = "c" | "w" | "r" | "t"
  export class Database implements DatabaseApi {
    constructor(options: { filename: string; flags: string; vfs?: any })
    filename: string
    pointer: number
    exec(input: string, opts?: ExecThisOptions | undefined): DatabaseApi
    exec(input: string, opts?: ExecResultRowsOptions | undefined)
    exec(opts: ExecThisOptions): DatabaseApi
    exec(opts: ExecResultRowsOptions)
    prepare(sql: string): PreparedStatement
    isOpen: () => boolean
    affirmOpen: () => DatabaseApi
    close: () => void
    changes: (
      total?: boolean | undefined,
      sixtyFour?: boolean | undefined
    ) => number
    dbFilename: () => string
    dbName: () => string
    dbVfsName: (dbName: any) => string
    createFunction: Function
    selectValue: Function
    selectValues: Function
    selectArray: Function
    selectObject: Function
    selectArrays: Function
    selectObjects: Function
    openStatementCount: Function
    transaction: Function
    savepoint: Function
    checkRc: Function
    constructor(filename: string, flags: string, vfs?: any)
  }

  class WasmAllocError extends Error {
    constructor(message: string)
    toss: any
  }

  class SQLite3Error extends Error {
    constructor(message: string)
  }

  type Sqlite3Static = {
    capi: CAPI
    wasm: WASM_API
    // Object Oriented API https://sqlite.org/wasm/doc/trunk/api-oo1.md
    oo1: {
      OpfsDb: typeof OpfsDatabase
      JsStorageDb: typeof JsStorageDb
      DB: typeof Database
    }
    opfs?: {
      metrics: any
      debug: any
      getResolvedPath: any
      getDirForFilename: any
      mkdir: any
      entryExists: any
      randomFilename: any
      registerVfs: any
      treeList: any
      rmfr: any
      unlink: any
      traverse: any
      rootDirectory: any
    }
    WasmAllocError: WasmAllocError
    SQLite3Error: SQLite3Error
    config: {
      exports: any
      memory: any
      bigIntEnabled: any
      debug: any
      warn: any
      error: any
      log: any
      wasmfsOpfsDir: any
      useStdAlloc: any
      allocExportName: any
      deallocExportName: any
      reallocExportName: any
      wasmOpfsDir: any
    }
    version: {
      libVersion: string
      libVersionNumber: any
      sourceId: any
      downloadVersion: any
    }
    client: any
    scriptInfo: {
      moduleScript: any
      isWorker: any
      location: any
      urlParams: any
      debugModule: any
    }
    initWorker1API: Function
    vfs: {
      installVfs: any
    }
    vtab: {
      xVtab: any
      xCursor: any
      xIndexInfo: any
      xError: any
      xRowid: any
      setupModule: any
    }
  }
  export default function init(opts: InitOptions): Promise<Sqlite3Static>

  // generated by Object.keys(sqlite3.capi).map(k => `${k}: any;`).join('\n')
  type CAPI = {
    sqlite3_bind_blob: any
    sqlite3_bind_text: any
    sqlite3_create_function_v2: any
    sqlite3_create_function: any
    sqlite3_create_window_function: any
    sqlite3_prepare_v3: any
    sqlite3_prepare_v2: any
    sqlite3_exec: any
    sqlite3_randomness: any
    sqlite3_wasmfs_opfs_dir: any
    sqlite3_wasmfs_filename_is_persistent: any
    sqlite3_js_db_uses_vfs: any
    sqlite3_js_vfs_list: any
    sqlite3_js_db_export: any
    sqlite3_js_db_vfs: any
    sqlite3_js_aggregate_context: any
    sqlite3_js_vfs_create_file: any
    sqlite3_db_config: any
    sqlite3_value_to_js: any
    sqlite3_values_to_js: any
    sqlite3_result_error_js: any
    sqlite3_result_js: any
    sqlite3_column_js: any
    sqlite3_preupdate_new_js: any
    sqlite3_preupdate_old_js: any
    sqlite3changeset_new_js: any
    sqlite3changeset_old_js: any
    sqlite3_aggregate_context: any
    sqlite3_bind_double: any
    sqlite3_bind_int: any
    sqlite3_bind_null: any
    sqlite3_bind_parameter_count: any
    sqlite3_bind_parameter_index: any
    sqlite3_bind_pointer: any
    sqlite3_busy_handler: any
    sqlite3_busy_timeout: any
    sqlite3_changes: any
    sqlite3_clear_bindings: any
    sqlite3_collation_needed: any
    sqlite3_column_blob: any
    sqlite3_column_bytes: any
    sqlite3_column_count: any
    sqlite3_column_double: any
    sqlite3_column_int: any
    sqlite3_column_name: any
    sqlite3_column_text: any
    sqlite3_column_type: any
    sqlite3_column_value: any
    sqlite3_commit_hook: any
    sqlite3_compileoption_get: any
    sqlite3_compileoption_used: any
    sqlite3_complete: any
    sqlite3_context_db_handle: any
    sqlite3_data_count: any
    sqlite3_db_filename: any
    sqlite3_db_handle: any
    sqlite3_db_name: any
    sqlite3_db_status: any
    sqlite3_errcode: any
    sqlite3_errmsg: any
    sqlite3_error_offset: any
    sqlite3_errstr: any
    sqlite3_expanded_sql: any
    sqlite3_extended_errcode: any
    sqlite3_extended_result_codes: any
    sqlite3_file_control: any
    sqlite3_finalize: any
    sqlite3_free: any
    sqlite3_get_auxdata: any
    sqlite3_initialize: any
    sqlite3_keyword_count: any
    sqlite3_keyword_name: any
    sqlite3_keyword_check: any
    sqlite3_libversion: any
    sqlite3_libversion_number: any
    sqlite3_limit: any
    sqlite3_malloc: any
    sqlite3_open: any
    sqlite3_open_v2: any
    sqlite3_progress_handler: any
    sqlite3_realloc: any
    sqlite3_reset: any
    sqlite3_result_blob: any
    sqlite3_result_double: any
    sqlite3_result_error: any
    sqlite3_result_error_code: any
    sqlite3_result_error_nomem: any
    sqlite3_result_error_toobig: any
    sqlite3_result_int: any
    sqlite3_result_null: any
    sqlite3_result_pointer: any
    sqlite3_result_subtype: any
    sqlite3_result_text: any
    sqlite3_result_zeroblob: any
    sqlite3_rollback_hook: any
    sqlite3_set_authorizer: any
    sqlite3_set_auxdata: any
    sqlite3_shutdown: any
    sqlite3_sourceid: any
    sqlite3_sql: any
    sqlite3_status: any
    sqlite3_step: any
    sqlite3_stmt_isexplain: any
    sqlite3_stmt_readonly: any
    sqlite3_stmt_status: any
    sqlite3_strglob: any
    sqlite3_stricmp: any
    sqlite3_strlike: any
    sqlite3_strnicmp: any
    sqlite3_table_column_metadata: any
    sqlite3_total_changes: any
    sqlite3_trace_v2: any
    sqlite3_txn_state: any
    sqlite3_uri_boolean: any
    sqlite3_uri_key: any
    sqlite3_uri_parameter: any
    sqlite3_user_data: any
    sqlite3_value_blob: any
    sqlite3_value_bytes: any
    sqlite3_value_double: any
    sqlite3_value_dup: any
    sqlite3_value_free: any
    sqlite3_value_frombind: any
    sqlite3_value_int: any
    sqlite3_value_nochange: any
    sqlite3_value_numeric_type: any
    sqlite3_value_pointer: any
    sqlite3_value_subtype: any
    sqlite3_value_text: any
    sqlite3_value_type: any
    sqlite3_vfs_find: any
    sqlite3_vfs_register: any
    sqlite3_vfs_unregister: any
    sqlite3_bind_int64: any
    sqlite3_changes64: any
    sqlite3_column_int64: any
    sqlite3_create_module: any
    sqlite3_create_module_v2: any
    sqlite3_declare_vtab: any
    sqlite3_deserialize: any
    sqlite3_drop_modules: any
    sqlite3_last_insert_rowid: any
    sqlite3_malloc64: any
    sqlite3_msize: any
    sqlite3_overload_function: any
    sqlite3_preupdate_blobwrite: any
    sqlite3_preupdate_count: any
    sqlite3_preupdate_depth: any
    sqlite3_preupdate_hook: any
    sqlite3_preupdate_new: any
    sqlite3_preupdate_old: any
    sqlite3_realloc64: any
    sqlite3_result_int64: any
    sqlite3_result_zeroblob64: any
    sqlite3_serialize: any
    sqlite3_set_last_insert_rowid: any
    sqlite3_status64: any
    sqlite3_total_changes64: any
    sqlite3_update_hook: any
    sqlite3_uri_int64: any
    sqlite3_value_int64: any
    sqlite3_vtab_collation: any
    sqlite3_vtab_distinct: any
    sqlite3_vtab_in: any
    sqlite3_vtab_in_first: any
    sqlite3_vtab_in_next: any
    sqlite3_vtab_nochange: any
    sqlite3_vtab_on_conflict: any
    sqlite3_vtab_rhs_value: any
    sqlite3changegroup_add: any
    sqlite3changegroup_add_strm: any
    sqlite3changegroup_delete: any
    sqlite3changegroup_new: any
    sqlite3changegroup_output: any
    sqlite3changegroup_output_strm: any
    sqlite3changeset_apply: any
    sqlite3changeset_apply_strm: any
    sqlite3changeset_apply_v2: any
    sqlite3changeset_apply_v2_strm: any
    sqlite3changeset_concat: any
    sqlite3changeset_concat_strm: any
    sqlite3changeset_conflict: any
    sqlite3changeset_finalize: any
    sqlite3changeset_fk_conflicts: any
    sqlite3changeset_invert: any
    sqlite3changeset_invert_strm: any
    sqlite3changeset_new: any
    sqlite3changeset_next: any
    sqlite3changeset_old: any
    sqlite3changeset_op: any
    sqlite3changeset_pk: any
    sqlite3changeset_start: any
    sqlite3changeset_start_strm: any
    sqlite3changeset_start_v2: any
    sqlite3changeset_start_v2_strm: any
    sqlite3session_attach: any
    sqlite3session_changeset: any
    sqlite3session_changeset_size: any
    sqlite3session_changeset_strm: any
    sqlite3session_config: any
    sqlite3session_create: any
    sqlite3session_diff: any
    sqlite3session_enable: any
    sqlite3session_indirect: any
    sqlite3session_isempty: any
    sqlite3session_memory_used: any
    sqlite3session_object_config: any
    sqlite3session_patchset: any
    sqlite3session_patchset_strm: any
    sqlite3session_table_filter: any
    SQLITE_ACCESS_EXISTS: any
    SQLITE_ACCESS_READWRITE: any
    SQLITE_ACCESS_READ: any
    SQLITE_DENY: any
    SQLITE_IGNORE: any
    SQLITE_CREATE_INDEX: any
    SQLITE_CREATE_TABLE: any
    SQLITE_CREATE_TEMP_INDEX: any
    SQLITE_CREATE_TEMP_TABLE: any
    SQLITE_CREATE_TEMP_TRIGGER: any
    SQLITE_CREATE_TEMP_VIEW: any
    SQLITE_CREATE_TRIGGER: any
    SQLITE_CREATE_VIEW: any
    SQLITE_DELETE: any
    SQLITE_DROP_INDEX: any
    SQLITE_DROP_TABLE: any
    SQLITE_DROP_TEMP_INDEX: any
    SQLITE_DROP_TEMP_TABLE: any
    SQLITE_DROP_TEMP_TRIGGER: any
    SQLITE_DROP_TEMP_VIEW: any
    SQLITE_DROP_TRIGGER: any
    SQLITE_DROP_VIEW: any
    SQLITE_INSERT: any
    SQLITE_PRAGMA: any
    SQLITE_READ: any
    SQLITE_SELECT: any
    SQLITE_TRANSACTION: any
    SQLITE_UPDATE: any
    SQLITE_ATTACH: any
    SQLITE_DETACH: any
    SQLITE_ALTER_TABLE: any
    SQLITE_REINDEX: any
    SQLITE_ANALYZE: any
    SQLITE_CREATE_VTABLE: any
    SQLITE_DROP_VTABLE: any
    SQLITE_FUNCTION: any
    SQLITE_SAVEPOINT: any
    SQLITE_RECURSIVE: any
    SQLITE_STATIC: any
    SQLITE_TRANSIENT: any
    SQLITE_WASM_DEALLOC: any
    SQLITE_CHANGESETSTART_INVERT: any
    SQLITE_CHANGESETAPPLY_NOSAVEPOINT: any
    SQLITE_CHANGESETAPPLY_INVERT: any
    SQLITE_CHANGESET_DATA: any
    SQLITE_CHANGESET_NOTFOUND: any
    SQLITE_CHANGESET_CONFLICT: any
    SQLITE_CHANGESET_CONSTRAINT: any
    SQLITE_CHANGESET_FOREIGN_KEY: any
    SQLITE_CHANGESET_OMIT: any
    SQLITE_CHANGESET_REPLACE: any
    SQLITE_CHANGESET_ABORT: any
    SQLITE_CONFIG_SINGLETHREAD: any
    SQLITE_CONFIG_MULTITHREAD: any
    SQLITE_CONFIG_SERIALIZED: any
    SQLITE_CONFIG_MALLOC: any
    SQLITE_CONFIG_GETMALLOC: any
    SQLITE_CONFIG_SCRATCH: any
    SQLITE_CONFIG_PAGECACHE: any
    SQLITE_CONFIG_HEAP: any
    SQLITE_CONFIG_MEMSTATUS: any
    SQLITE_CONFIG_MUTEX: any
    SQLITE_CONFIG_GETMUTEX: any
    SQLITE_CONFIG_LOOKASIDE: any
    SQLITE_CONFIG_PCACHE: any
    SQLITE_CONFIG_GETPCACHE: any
    SQLITE_CONFIG_LOG: any
    SQLITE_CONFIG_URI: any
    SQLITE_CONFIG_PCACHE2: any
    SQLITE_CONFIG_GETPCACHE2: any
    SQLITE_CONFIG_COVERING_INDEX_SCAN: any
    SQLITE_CONFIG_SQLLOG: any
    SQLITE_CONFIG_MMAP_SIZE: any
    SQLITE_CONFIG_WIN32_HEAPSIZE: any
    SQLITE_CONFIG_PCACHE_HDRSZ: any
    SQLITE_CONFIG_PMASZ: any
    SQLITE_CONFIG_STMTJRNL_SPILL: any
    SQLITE_CONFIG_SMALL_MALLOC: any
    SQLITE_CONFIG_SORTERREF_SIZE: any
    SQLITE_CONFIG_MEMDB_MAXSIZE: any
    SQLITE_INTEGER: any
    SQLITE_FLOAT: any
    SQLITE_TEXT: any
    SQLITE_BLOB: any
    SQLITE_NULL: any
    SQLITE_DBCONFIG_MAINDBNAME: any
    SQLITE_DBCONFIG_LOOKASIDE: any
    SQLITE_DBCONFIG_ENABLE_FKEY: any
    SQLITE_DBCONFIG_ENABLE_TRIGGER: any
    SQLITE_DBCONFIG_ENABLE_FTS3_TOKENIZER: any
    SQLITE_DBCONFIG_ENABLE_LOAD_EXTENSION: any
    SQLITE_DBCONFIG_NO_CKPT_ON_CLOSE: any
    SQLITE_DBCONFIG_ENABLE_QPSG: any
    SQLITE_DBCONFIG_TRIGGER_EQP: any
    SQLITE_DBCONFIG_RESET_DATABASE: any
    SQLITE_DBCONFIG_DEFENSIVE: any
    SQLITE_DBCONFIG_WRITABLE_SCHEMA: any
    SQLITE_DBCONFIG_LEGACY_ALTER_TABLE: any
    SQLITE_DBCONFIG_DQS_DML: any
    SQLITE_DBCONFIG_DQS_DDL: any
    SQLITE_DBCONFIG_ENABLE_VIEW: any
    SQLITE_DBCONFIG_LEGACY_FILE_FORMAT: any
    SQLITE_DBCONFIG_TRUSTED_SCHEMA: any
    SQLITE_DBCONFIG_MAX: any
    SQLITE_DBSTATUS_LOOKASIDE_USED: any
    SQLITE_DBSTATUS_CACHE_USED: any
    SQLITE_DBSTATUS_SCHEMA_USED: any
    SQLITE_DBSTATUS_STMT_USED: any
    SQLITE_DBSTATUS_LOOKASIDE_HIT: any
    SQLITE_DBSTATUS_LOOKASIDE_MISS_SIZE: any
    SQLITE_DBSTATUS_LOOKASIDE_MISS_FULL: any
    SQLITE_DBSTATUS_CACHE_HIT: any
    SQLITE_DBSTATUS_CACHE_MISS: any
    SQLITE_DBSTATUS_CACHE_WRITE: any
    SQLITE_DBSTATUS_DEFERRED_FKS: any
    SQLITE_DBSTATUS_CACHE_USED_SHARED: any
    SQLITE_DBSTATUS_CACHE_SPILL: any
    SQLITE_DBSTATUS_MAX: any
    SQLITE_UTF8: any
    SQLITE_UTF16LE: any
    SQLITE_UTF16BE: any
    SQLITE_UTF16: any
    SQLITE_UTF16_ALIGNED: any
    SQLITE_FCNTL_LOCKSTATE: any
    SQLITE_FCNTL_GET_LOCKPROXYFILE: any
    SQLITE_FCNTL_SET_LOCKPROXYFILE: any
    SQLITE_FCNTL_LAST_ERRNO: any
    SQLITE_FCNTL_SIZE_HINT: any
    SQLITE_FCNTL_CHUNK_SIZE: any
    SQLITE_FCNTL_FILE_POINTER: any
    SQLITE_FCNTL_SYNC_OMITTED: any
    SQLITE_FCNTL_WIN32_AV_RETRY: any
    SQLITE_FCNTL_PERSIST_WAL: any
    SQLITE_FCNTL_OVERWRITE: any
    SQLITE_FCNTL_VFSNAME: any
    SQLITE_FCNTL_POWERSAFE_OVERWRITE: any
    SQLITE_FCNTL_PRAGMA: any
    SQLITE_FCNTL_BUSYHANDLER: any
    SQLITE_FCNTL_TEMPFILENAME: any
    SQLITE_FCNTL_MMAP_SIZE: any
    SQLITE_FCNTL_TRACE: any
    SQLITE_FCNTL_HAS_MOVED: any
    SQLITE_FCNTL_SYNC: any
    SQLITE_FCNTL_COMMIT_PHASETWO: any
    SQLITE_FCNTL_WIN32_SET_HANDLE: any
    SQLITE_FCNTL_WAL_BLOCK: any
    SQLITE_FCNTL_ZIPVFS: any
    SQLITE_FCNTL_RBU: any
    SQLITE_FCNTL_VFS_POINTER: any
    SQLITE_FCNTL_JOURNAL_POINTER: any
    SQLITE_FCNTL_WIN32_GET_HANDLE: any
    SQLITE_FCNTL_PDB: any
    SQLITE_FCNTL_BEGIN_ATOMIC_WRITE: any
    SQLITE_FCNTL_COMMIT_ATOMIC_WRITE: any
    SQLITE_FCNTL_ROLLBACK_ATOMIC_WRITE: any
    SQLITE_FCNTL_LOCK_TIMEOUT: any
    SQLITE_FCNTL_DATA_VERSION: any
    SQLITE_FCNTL_SIZE_LIMIT: any
    SQLITE_FCNTL_CKPT_DONE: any
    SQLITE_FCNTL_RESERVE_BYTES: any
    SQLITE_FCNTL_CKPT_START: any
    SQLITE_FCNTL_EXTERNAL_READER: any
    SQLITE_FCNTL_CKSM_FILE: any
    SQLITE_LOCK_NONE: any
    SQLITE_LOCK_SHARED: any
    SQLITE_LOCK_RESERVED: any
    SQLITE_LOCK_PENDING: any
    SQLITE_LOCK_EXCLUSIVE: any
    SQLITE_IOCAP_ATOMIC: any
    SQLITE_IOCAP_ATOMIC512: any
    SQLITE_IOCAP_ATOMIC1K: any
    SQLITE_IOCAP_ATOMIC2K: any
    SQLITE_IOCAP_ATOMIC4K: any
    SQLITE_IOCAP_ATOMIC8K: any
    SQLITE_IOCAP_ATOMIC16K: any
    SQLITE_IOCAP_ATOMIC32K: any
    SQLITE_IOCAP_ATOMIC64K: any
    SQLITE_IOCAP_SAFE_APPEND: any
    SQLITE_IOCAP_SEQUENTIAL: any
    SQLITE_IOCAP_UNDELETABLE_WHEN_OPEN: any
    SQLITE_IOCAP_POWERSAFE_OVERWRITE: any
    SQLITE_IOCAP_IMMUTABLE: any
    SQLITE_IOCAP_BATCH_ATOMIC: any
    SQLITE_MAX_ALLOCATION_SIZE: any
    SQLITE_LIMIT_LENGTH: any
    SQLITE_MAX_LENGTH: any
    SQLITE_LIMIT_SQL_LENGTH: any
    SQLITE_MAX_SQL_LENGTH: any
    SQLITE_LIMIT_COLUMN: any
    SQLITE_MAX_COLUMN: any
    SQLITE_LIMIT_EXPR_DEPTH: any
    SQLITE_MAX_EXPR_DEPTH: any
    SQLITE_LIMIT_COMPOUND_SELECT: any
    SQLITE_MAX_COMPOUND_SELECT: any
    SQLITE_LIMIT_VDBE_OP: any
    SQLITE_MAX_VDBE_OP: any
    SQLITE_LIMIT_FUNCTION_ARG: any
    SQLITE_MAX_FUNCTION_ARG: any
    SQLITE_LIMIT_ATTACHED: any
    SQLITE_MAX_ATTACHED: any
    SQLITE_LIMIT_LIKE_PATTERN_LENGTH: any
    SQLITE_MAX_LIKE_PATTERN_LENGTH: any
    SQLITE_LIMIT_VARIABLE_NUMBER: any
    SQLITE_MAX_VARIABLE_NUMBER: any
    SQLITE_LIMIT_TRIGGER_DEPTH: any
    SQLITE_MAX_TRIGGER_DEPTH: any
    SQLITE_LIMIT_WORKER_THREADS: any
    SQLITE_MAX_WORKER_THREADS: any
    SQLITE_OPEN_READONLY: any
    SQLITE_OPEN_READWRITE: any
    SQLITE_OPEN_CREATE: any
    SQLITE_OPEN_URI: any
    SQLITE_OPEN_MEMORY: any
    SQLITE_OPEN_NOMUTEX: any
    SQLITE_OPEN_FULLMUTEX: any
    SQLITE_OPEN_SHAREDCACHE: any
    SQLITE_OPEN_PRIVATECACHE: any
    SQLITE_OPEN_EXRESCODE: any
    SQLITE_OPEN_NOFOLLOW: any
    SQLITE_OPEN_MAIN_DB: any
    SQLITE_OPEN_MAIN_JOURNAL: any
    SQLITE_OPEN_TEMP_DB: any
    SQLITE_OPEN_TEMP_JOURNAL: any
    SQLITE_OPEN_TRANSIENT_DB: any
    SQLITE_OPEN_SUBJOURNAL: any
    SQLITE_OPEN_SUPER_JOURNAL: any
    SQLITE_OPEN_WAL: any
    SQLITE_OPEN_DELETEONCLOSE: any
    SQLITE_OPEN_EXCLUSIVE: any
    SQLITE_PREPARE_PERSISTENT: any
    SQLITE_PREPARE_NORMALIZE: any
    SQLITE_PREPARE_NO_VTAB: any
    SQLITE_OK: any
    SQLITE_ERROR: any
    SQLITE_INTERNAL: any
    SQLITE_PERM: any
    SQLITE_ABORT: any
    SQLITE_BUSY: any
    SQLITE_LOCKED: any
    SQLITE_NOMEM: any
    SQLITE_READONLY: any
    SQLITE_INTERRUPT: any
    SQLITE_IOERR: any
    SQLITE_CORRUPT: any
    SQLITE_NOTFOUND: any
    SQLITE_FULL: any
    SQLITE_CANTOPEN: any
    SQLITE_PROTOCOL: any
    SQLITE_EMPTY: any
    SQLITE_SCHEMA: any
    SQLITE_TOOBIG: any
    SQLITE_CONSTRAINT: any
    SQLITE_MISMATCH: any
    SQLITE_MISUSE: any
    SQLITE_NOLFS: any
    SQLITE_AUTH: any
    SQLITE_FORMAT: any
    SQLITE_RANGE: any
    SQLITE_NOTADB: any
    SQLITE_NOTICE: any
    SQLITE_WARNING: any
    SQLITE_ROW: any
    SQLITE_DONE: any
    SQLITE_ERROR_MISSING_COLLSEQ: any
    SQLITE_ERROR_RETRY: any
    SQLITE_ERROR_SNAPSHOT: any
    SQLITE_IOERR_READ: any
    SQLITE_IOERR_SHORT_READ: any
    SQLITE_IOERR_WRITE: any
    SQLITE_IOERR_FSYNC: any
    SQLITE_IOERR_DIR_FSYNC: any
    SQLITE_IOERR_TRUNCATE: any
    SQLITE_IOERR_FSTAT: any
    SQLITE_IOERR_UNLOCK: any
    SQLITE_IOERR_RDLOCK: any
    SQLITE_IOERR_DELETE: any
    SQLITE_IOERR_BLOCKED: any
    SQLITE_IOERR_NOMEM: any
    SQLITE_IOERR_ACCESS: any
    SQLITE_IOERR_CHECKRESERVEDLOCK: any
    SQLITE_IOERR_LOCK: any
    SQLITE_IOERR_CLOSE: any
    SQLITE_IOERR_DIR_CLOSE: any
    SQLITE_IOERR_SHMOPEN: any
    SQLITE_IOERR_SHMSIZE: any
    SQLITE_IOERR_SHMLOCK: any
    SQLITE_IOERR_SHMMAP: any
    SQLITE_IOERR_SEEK: any
    SQLITE_IOERR_DELETE_NOENT: any
    SQLITE_IOERR_MMAP: any
    SQLITE_IOERR_GETTEMPPATH: any
    SQLITE_IOERR_CONVPATH: any
    SQLITE_IOERR_VNODE: any
    SQLITE_IOERR_AUTH: any
    SQLITE_IOERR_BEGIN_ATOMIC: any
    SQLITE_IOERR_COMMIT_ATOMIC: any
    SQLITE_IOERR_ROLLBACK_ATOMIC: any
    SQLITE_IOERR_DATA: any
    SQLITE_IOERR_CORRUPTFS: any
    SQLITE_LOCKED_SHAREDCACHE: any
    SQLITE_LOCKED_VTAB: any
    SQLITE_BUSY_RECOVERY: any
    SQLITE_BUSY_SNAPSHOT: any
    SQLITE_BUSY_TIMEOUT: any
    SQLITE_CANTOPEN_NOTEMPDIR: any
    SQLITE_CANTOPEN_ISDIR: any
    SQLITE_CANTOPEN_FULLPATH: any
    SQLITE_CANTOPEN_CONVPATH: any
    SQLITE_CANTOPEN_SYMLINK: any
    SQLITE_CORRUPT_VTAB: any
    SQLITE_CORRUPT_SEQUENCE: any
    SQLITE_CORRUPT_INDEX: any
    SQLITE_READONLY_RECOVERY: any
    SQLITE_READONLY_CANTLOCK: any
    SQLITE_READONLY_ROLLBACK: any
    SQLITE_READONLY_DBMOVED: any
    SQLITE_READONLY_CANTINIT: any
    SQLITE_READONLY_DIRECTORY: any
    SQLITE_ABORT_ROLLBACK: any
    SQLITE_CONSTRAINT_CHECK: any
    SQLITE_CONSTRAINT_COMMITHOOK: any
    SQLITE_CONSTRAINT_FOREIGNKEY: any
    SQLITE_CONSTRAINT_FUNCTION: any
    SQLITE_CONSTRAINT_NOTNULL: any
    SQLITE_CONSTRAINT_PRIMARYKEY: any
    SQLITE_CONSTRAINT_TRIGGER: any
    SQLITE_CONSTRAINT_UNIQUE: any
    SQLITE_CONSTRAINT_VTAB: any
    SQLITE_CONSTRAINT_ROWID: any
    SQLITE_CONSTRAINT_PINNED: any
    SQLITE_CONSTRAINT_DATATYPE: any
    SQLITE_NOTICE_RECOVER_WAL: any
    SQLITE_NOTICE_RECOVER_ROLLBACK: any
    SQLITE_WARNING_AUTOINDEX: any
    SQLITE_AUTH_USER: any
    SQLITE_OK_LOAD_PERMANENTLY: any
    SQLITE_STATUS_MEMORY_USED: any
    SQLITE_STATUS_PAGECACHE_USED: any
    SQLITE_STATUS_PAGECACHE_OVERFLOW: any
    SQLITE_STATUS_MALLOC_SIZE: any
    SQLITE_STATUS_PARSER_STACK: any
    SQLITE_STATUS_PAGECACHE_SIZE: any
    SQLITE_STATUS_MALLOC_COUNT: any
    SQLITE_STMTSTATUS_FULLSCAN_STEP: any
    SQLITE_STMTSTATUS_SORT: any
    SQLITE_STMTSTATUS_AUTOINDEX: any
    SQLITE_STMTSTATUS_VM_STEP: any
    SQLITE_STMTSTATUS_REPREPARE: any
    SQLITE_STMTSTATUS_RUN: any
    SQLITE_STMTSTATUS_FILTER_MISS: any
    SQLITE_STMTSTATUS_FILTER_HIT: any
    SQLITE_STMTSTATUS_MEMUSED: any
    SQLITE_SYNC_NORMAL: any
    SQLITE_SYNC_FULL: any
    SQLITE_SYNC_DATAONLY: any
    SQLITE_TRACE_STMT: any
    SQLITE_TRACE_PROFILE: any
    SQLITE_TRACE_ROW: any
    SQLITE_TRACE_CLOSE: any
    SQLITE_TXN_NONE: any
    SQLITE_TXN_READ: any
    SQLITE_TXN_WRITE: any
    SQLITE_DETERMINISTIC: any
    SQLITE_DIRECTONLY: any
    SQLITE_INNOCUOUS: any
    SQLITE_VERSION_NUMBER: any
    SQLITE_VERSION: any
    SQLITE_SOURCE_ID: any
    SQLITE_SERIALIZE_NOCOPY: any
    SQLITE_DESERIALIZE_FREEONCLOSE: any
    SQLITE_DESERIALIZE_READONLY: any
    SQLITE_DESERIALIZE_RESIZEABLE: any
    SQLITE_SESSION_CONFIG_STRMSIZE: any
    SQLITE_SESSION_OBJCONFIG_SIZE: any
    SQLITE_INDEX_SCAN_UNIQUE: any
    SQLITE_INDEX_CONSTRAINT_EQ: any
    SQLITE_INDEX_CONSTRAINT_GT: any
    SQLITE_INDEX_CONSTRAINT_LE: any
    SQLITE_INDEX_CONSTRAINT_LT: any
    SQLITE_INDEX_CONSTRAINT_GE: any
    SQLITE_INDEX_CONSTRAINT_MATCH: any
    SQLITE_INDEX_CONSTRAINT_LIKE: any
    SQLITE_INDEX_CONSTRAINT_GLOB: any
    SQLITE_INDEX_CONSTRAINT_REGEXP: any
    SQLITE_INDEX_CONSTRAINT_NE: any
    SQLITE_INDEX_CONSTRAINT_ISNOT: any
    SQLITE_INDEX_CONSTRAINT_ISNOTNULL: any
    SQLITE_INDEX_CONSTRAINT_ISNULL: any
    SQLITE_INDEX_CONSTRAINT_IS: any
    SQLITE_INDEX_CONSTRAINT_LIMIT: any
    SQLITE_INDEX_CONSTRAINT_OFFSET: any
    SQLITE_INDEX_CONSTRAINT_FUNCTION: any
    SQLITE_VTAB_CONSTRAINT_SUPPORT: any
    SQLITE_VTAB_INNOCUOUS: any
    SQLITE_VTAB_DIRECTONLY: any
    SQLITE_ROLLBACK: any
    SQLITE_FAIL: any
    SQLITE_REPLACE: any
    sqlite3_js_rc_str: any
    sqlite3_vfs: any
    sqlite3_io_methods: any
    sqlite3_file: any
    sqlite3_vtab: any
    sqlite3_vtab_cursor: any
    sqlite3_module: any
    sqlite3_index_info: any
    sqlite3_vtab_config: any
    sqlite3_close_v2: any
    sqlite3session_delete: any
    sqlite3_create_collation_v2: any
    sqlite3_create_collation: any
    sqlite3_config: any
    sqlite3_auto_extension: any
    sqlite3_cancel_auto_extension: any
    sqlite3_reset_auto_extension: any
  }

  // generated by console.log(Object.keys(sqlite3.wasm).map(t => `    ${t}: any;`).join('\n'))
  type WASM_API = {
    ptrSizeof: any
    ptrIR: any
    bigIntEnabled: any
    exports: any
    memory: any
    alloc: any
    realloc: any
    dealloc: any
    allocFromTypedArray: any
    compileOptionUsed: any
    pstack: any
    sizeofIR: any
    heap8: any
    heap8u: any
    heap16: any
    heap16u: any
    heap32: any
    heap32u: any
    heapForSize: any
    functionTable: any
    functionEntry: any
    jsFuncToWasm: any
    installFunction: any
    scopedInstallFunction: any
    uninstallFunction: any
    peek: any
    poke: any
    peekPtr: any
    pokePtr: any
    peek8: any
    poke8: any
    peek16: any
    poke16: any
    peek32: any
    poke32: any
    peek64: any
    poke64: any
    peek32f: any
    poke32f: any
    peek64f: any
    poke64f: any
    getMemValue: any
    getPtrValue: any
    setMemValue: any
    setPtrValue: any
    isPtr32: any
    isPtr: any
    cstrlen: any
    cstrToJs: any
    jstrlen: any
    jstrcpy: any
    cstrncpy: any
    jstrToUintArray: any
    allocCString: any
    scopedAllocPush: any
    scopedAllocPop: any
    scopedAlloc: any
    scopedAllocCString: any
    scopedAllocMainArgv: any
    allocMainArgv: any
    cArgvToJs: any
    scopedAllocCall: any
    allocPtr: any
    scopedAllocPtr: any
    xGet: any
    xCall: any
    xWrap: any
    xCallWrapped: any
    sqlite3_wasm_db_reset: any
    sqlite3_wasm_db_vfs: any
    sqlite3_wasm_vfs_create_file: any
    sqlite3_wasm_vfs_unlink: any
    ctype: any
  }
}
