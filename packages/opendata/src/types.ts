/**
 * OpenData Types - V3 (Clean)
 *
 * Code-based Adapter definition (defineAdapter)
 */

// ============================================
// Enums
// ============================================

export type AgentRole = "consumer" | "producer" | "platform"

export type GoodCategory =
  | "book"
  | "article"
  | "video"
  | "audio"
  | "course"
  | "movie"
  | "post"
  | "tweet"
  | "thread"
  | "note"
  | "comment"
  | "shelf"
  | "playlist"
  | "folder"
  | "tag"
  | "inbox"
  | "kanban"

export type RelationType =
  | "PRODUCES"
  | "CONSUMES"
  | "OWNS"
  | "FOLLOWS"
  | "CONTAINS"
  | "REFERENCES"

export type EntityType = "agent" | "good"

export type GoodStatus = "active" | "archived" | "deleted"

// ============================================
// Entities
// ============================================

export interface Agent {
  id: string
  role: AgentRole
  is_consumer: boolean
  name: string
  avatar_url?: string
  fingerprints: string // JSON
  description?: string
  created_at: number
  updated_at: number
}

export interface Good {
  id: string
  category: GoodCategory
  title: string
  summary?: string
  is_container: boolean
  owner_id?: string
  produced_by?: string
  co_producers: string // JSON
  fingerprints: string // JSON
  use_value: string // JSON
  exchange_value: string // JSON
  production_data: string // JSON
  container_rules?: string // JSON
  status: GoodStatus
  created_at: number
  published_at?: number
  updated_at: number
}

export interface Relation {
  id: string
  type: RelationType
  subject_type: EntityType
  subject_id: string
  object_type: EntityType
  object_id: string
  context: string // JSON
  source?: string
  source_id?: string
  created_at: number
  updated_at: number
}

// ============================================
// Inputs (for create/update)
// ============================================

export interface CreateAgentInput {
  id?: string
  role: AgentRole
  name: string
  fingerprints?: Record<string, string>
  description?: string
  avatar_url?: string
}

export interface CreateGoodInput {
  id?: string
  category: GoodCategory
  title: string
  summary?: string
  is_container?: boolean
  owner_id?: string
  produced_by?: string
  co_producers?: string[]
  fingerprints?: Record<string, string>
  use_value?: Record<string, unknown>
  exchange_value?: Record<string, unknown>
  production_data?: Record<string, { raw: unknown; fetched_at: number }>
  published_at?: number
}

export interface CreateRelationInput {
  type: RelationType
  subject_type: EntityType
  subject_id: string
  object_type: EntityType
  object_id: string
  context?: Record<string, unknown>
  source?: string
  source_id?: string
}

// ============================================
// Raw Data (Step 1)
// ============================================

export interface RawEntity {
  entityType: string
  entityId: string
  data: any
  meta?: Record<string, any>
}

// ============================================
// Transform (Step 2)
// ============================================

export interface TransformResult {
  agents?: CreateAgentInput[]
  goods?: CreateGoodInput[]
  relations?: CreateRelationInput[]
}

// ============================================
// Adapter Context
// ============================================

export interface BrowserContext {
  navigate(url: string): Promise<void>
  settle(ms: number): Promise<void>
  evaluate<T, Args extends any[]>(
    fn: (...args: Args) => T | Promise<T>,
    ...args: Args
  ): Promise<T>
  click(selector: string): Promise<void>
  fill(selector: string, value: string): Promise<void>
}

export interface HttpContext {
  get(url: string, params?: Record<string, any>): Promise<any>
  post(url: string, body?: any, headers?: Record<string, string>): Promise<any>
}

export interface FetchContext {
  args: Record<string, any>
  browser: BrowserContext
  http: HttpContext
  log: (message: string, ...args: any[]) => void
}

// ============================================
// Adapter V3 Interface (defineAdapter)
// ============================================

export interface OpenDataAdapter {
  meta: {
    site: string
    name: string
    description?: string
    domain: string
    version?: string
    author?: string
    tags?: string[]
  }

  protocol: {
    strategy: "public" | "cookie" | "auth" | "oauth"
    browser?: boolean
    entryPoint?: string
    /** Enable DevTools for debugging (default: false) */
    devTools?: boolean
  }

  args?: Record<
    string,
    {
      type: "string" | "int" | "float" | "bool"
      required?: boolean
      default?: any
      description?: string
      positional?: boolean
    }
  >

  /**
   * Step 1: Fetch - Get raw data
   */
  fetch(ctx: FetchContext): Promise<RawEntity[]>

  /**
   * Step 2: Transform - Convert to Economic model (optional)
   */
  transform?(raw: RawEntity): TransformResult | Promise<TransformResult>

  /**
   * DataView query examples (optional)
   */
  queries?: Record<string, string>

  /**
   * Sync configuration (optional)
   */
  sync?: {
    incremental?: boolean
    cursorField?: string
    changeDetection?: "checksum" | "timestamp" | "hash"
  }
}

// ============================================
// Database Interface
// ============================================

export interface IOpenDataDatabase {
  prepare(sql: string): {
    get: (...params: any[]) => any
    all: (...params: any[]) => any[]
    run: (...params: any[]) => { changes: number }
  }
  exec(sql: string): void
  transaction<T>(fn: () => T): () => T
}

// ============================================
// Query Options
// ============================================

export interface MatchedAdapter {
  site: string
  name: string
  description?: string
  domain: string
  adapter: OpenDataAdapter
  filePath: string
}

export interface QueryGoodsOptions {
  category?: GoodCategory
  status?: GoodStatus
  owner_id?: string
  produced_by?: string
  source?: string
  limit?: number
  offset?: number
  order_by?: string
  order_desc?: boolean
}

export interface QueryRelationsOptions {
  type?: RelationType
  subject_type?: EntityType
  subject_id?: string
  object_type?: EntityType
  object_id?: string
  source?: string
}

// ============================================
// Result Types
// ============================================

export interface OpenDataResult {
  source: string
  data: any[]
  columns?: string[]
  adapter: OpenDataAdapter
  persisted?: {
    agents: number
    goods: number
    relations: number
  }
}
