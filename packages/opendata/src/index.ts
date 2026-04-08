// Core
export { OpenData } from "./opendata.js"

// Manager
export {
  OpenDataManager,
  type FileSystem,
  type AdapterLoader,
} from "./manager.js"

// Parser
export {
  loadAdapter,
  findAdapters,
  findMatchingAdapters,
  groupAdaptersBySite,
  isDomainMatch,
} from "./parser.js"

// Define Adapter (Main API)
export {
  defineAdapter,
  defineRawAdapter,
  defineCookieAdapter,
  definePublicAdapter,
  $,
  helpers,
} from "./define.js"

// Raw Data
export { RawDataStore, CREATE_RAW_DATA_TABLE_SQL } from "./db/raw-data.js"
export type { RawDataRecord } from "./db/raw-data.js"

// Schema
export { CREATE_TABLES_SQL, INIT_DATA_SQL, SCHEMA_VERSION } from "./schema.js"

// Types
export type {
  // Enums
  AgentRole,
  GoodCategory,
  RelationType,
  EntityType,
  GoodStatus,

  // Entities
  Agent,
  Good,
  Relation,

  // Inputs
  CreateAgentInput,
  CreateGoodInput,
  CreateRelationInput,

  // Adapter
  OpenDataAdapter,
  FetchContext,
  BrowserContext,
  HttpContext,
  RawEntity,
  TransformResult,
  MatchedAdapter,
  OpenDataResult,

  // Database
  IOpenDataDatabase,
  QueryGoodsOptions,
  QueryRelationsOptions,
} from "./types.js"
