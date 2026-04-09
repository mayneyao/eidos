// Core
export { RawData } from "./rawdata.js"

// Manager
export {
  RawDataManager,
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
export { SourceDataStore } from "./source.js"
export type { RawDataRecord } from "./source.js"

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
  RawDataAdapter,
  FetchContext,
  BrowserContext,
  HttpContext,
  RawEntity,
  TransformResult,
  MatchedAdapter,
  RawDataResult,

  // Database
  IRawDataDatabase,
  QueryGoodsOptions,
  QueryRelationsOptions,
} from "./types.js"
