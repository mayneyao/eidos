import type {
  Agent,
  AgentRole,
  CreateAgentInput,
  CreateGoodInput,
  CreateRelationInput,
  Good,
  GoodCategory,
  QueryGoodsOptions,
  QueryRelationsOptions,
  Relation,
  RelationType,
  IRawDataDatabase,
} from "./types.js"

// Adapter sync result interface
interface AdapterSyncResult {
  source: string
  agents: {
    external_id: string
    name: string
    role?: string
    fingerprints?: Record<string, string>
    description?: string
  }[]
  goods: {
    external_id: string
    category: string
    title: string
    produced_by_external_id?: string
    fingerprints?: Record<string, string>
    summary?: string
    use_value?: Record<string, unknown>
    exchange_value?: Record<string, unknown>
    raw_data: unknown
  }[]
  relations: {
    type: string
    subject_external_id: string
    object_external_id: string
    context?: Record<string, unknown>
  }[]
  cursor?: string
  has_more: boolean
}
import { CREATE_TABLES_SQL, INIT_DATA_SQL } from "./schema.js"

/**
 * RawData - Core personal data management class
 *
 * Based on economics model:
 * - Agents: Economic agents (consumers, producers)
 * - Goods: Goods (content, containers)
 * - Relations: Production relations
 */
export class RawData {
  private db: IRawDataDatabase
  private debug: boolean

  constructor(db: IRawDataDatabase, options: { debug?: boolean } = {}) {
    this.db = db
    this.debug = options.debug ?? false
    this.init()
  }

  private log(...args: unknown[]) {
    if (this.debug) {
      console.log("[RawData]", ...args)
    }
  }

  /**
   * Initialize database tables
   */
  private init() {
    this.db.exec(CREATE_TABLES_SQL)
    this.db.exec(INIT_DATA_SQL)
    this.log("Database initialized")
  }

  /**
   * Get underlying database instance (for advanced operations like transactions)
   */
  getDatabase(): IRawDataDatabase {
    return this.db
  }

  // ============================================
  // Agents Operations
  // ============================================

  createAgent(input: CreateAgentInput): Agent {
    const id =
      input.id ??
      `agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const now = Math.floor(Date.now() / 1000)

    const stmt = this.db.prepare(`
      INSERT INTO agents (id, role, is_consumer, name, avatar_url, fingerprints, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        role = excluded.role,
        name = excluded.name,
        avatar_url = excluded.avatar_url,
        fingerprints = excluded.fingerprints,
        description = excluded.description,
        updated_at = excluded.updated_at
      RETURNING *
    `)

    const result = stmt.get(
      id,
      input.role,
      input.role === "consumer" ? 1 : 0,
      input.name,
      input.avatar_url ?? null,
      JSON.stringify(input.fingerprints ?? {}),
      input.description ?? null,
      now,
      now
    ) as Record<string, unknown>

    return this.parseAgent(result)
  }

  findAgentByFingerprint(platform: string, externalId: string): Agent | null {
    const stmt = this.db.prepare(`
      SELECT * FROM agents
      WHERE json_extract(fingerprints, '$.${platform}') = ?
      LIMIT 1
    `)
    const result = stmt.get(externalId) as Record<string, unknown> | undefined
    return result ? this.parseAgent(result) : null
  }

  getConsumer(): Agent {
    const stmt = this.db.prepare(
      `SELECT * FROM agents WHERE is_consumer = 1 LIMIT 1`
    )
    const result = stmt.get() as Record<string, unknown>
    return this.parseAgent(result)
  }

  getAgent(id: string): Agent | null {
    const stmt = this.db.prepare(`SELECT * FROM agents WHERE id = ?`)
    const result = stmt.get(id) as Record<string, unknown> | undefined
    return result ? this.parseAgent(result) : null
  }

  // ============================================
  // Goods Operations
  // ============================================

  createGood(input: CreateGoodInput): Good {
    const id =
      input.id ?? `good-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const now = Math.floor(Date.now() / 1000)

    const stmt = this.db.prepare(`
      INSERT INTO goods (
        id, category, title, summary, is_container, owner_id, produced_by,
        co_producers, fingerprints, use_value, exchange_value, production_data,
        published_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        summary = excluded.summary,
        owner_id = excluded.owner_id,
        produced_by = excluded.produced_by,
        co_producers = excluded.co_producers,
        fingerprints = excluded.fingerprints,
        use_value = excluded.use_value,
        exchange_value = excluded.exchange_value,
        production_data = json_patch(production_data, excluded.production_data),
        updated_at = excluded.updated_at
      RETURNING *
    `)

    const result = stmt.get(
      id,
      input.category,
      input.title,
      input.summary ?? null,
      input.is_container ? 1 : 0,
      input.owner_id ?? null,
      input.produced_by ?? null,
      JSON.stringify(input.co_producers ?? []),
      JSON.stringify(input.fingerprints ?? {}),
      JSON.stringify(input.use_value ?? {}),
      JSON.stringify(input.exchange_value ?? {}),
      JSON.stringify(input.production_data ?? {}),
      input.published_at ?? null,
      now,
      now
    ) as Record<string, unknown>

    return this.parseGood(result)
  }

  findGoodByFingerprint(key: string, value: string): Good | null {
    const stmt = this.db.prepare(`
      SELECT * FROM goods
      WHERE json_extract(fingerprints, '$.${key}') = ?
      LIMIT 1
    `)
    const result = stmt.get(value) as Record<string, unknown> | undefined
    return result ? this.parseGood(result) : null
  }

  queryGoods(options: QueryGoodsOptions = {}): Good[] {
    let sql = `SELECT * FROM goods WHERE 1=1`
    const params: unknown[] = []

    if (options.category) {
      sql += ` AND category = ?`
      params.push(options.category)
    }
    if (options.status) {
      sql += ` AND status = ?`
      params.push(options.status)
    }
    if (options.owner_id) {
      sql += ` AND owner_id = ?`
      params.push(options.owner_id)
    }
    if (options.produced_by) {
      sql += ` AND produced_by = ?`
      params.push(options.produced_by)
    }

    sql += ` ORDER BY ${options.order_by ?? "created_at"} ${options.order_desc ? "DESC" : "ASC"}`

    if (options.limit) {
      sql += ` LIMIT ?`
      params.push(options.limit)
    }
    if (options.offset) {
      sql += ` OFFSET ?`
      params.push(options.offset)
    }

    const stmt = this.db.prepare(sql)
    const results = stmt.all(...params) as Record<string, unknown>[]
    return results.map((r) => this.parseGood(r))
  }

  getGood(id: string): Good | null {
    const stmt = this.db.prepare(`SELECT * FROM goods WHERE id = ?`)
    const result = stmt.get(id) as Record<string, unknown> | undefined
    return result ? this.parseGood(result) : null
  }

  // ============================================
  // Relations Operations
  // ============================================

  createRelation(input: CreateRelationInput): Relation {
    const id = `rel-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const now = Math.floor(Date.now() / 1000)

    const stmt = this.db.prepare(`
      INSERT INTO relations (id, type, subject_type, subject_id, object_type, object_id, context, source, source_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(type, subject_id, object_id) DO UPDATE SET
        context = json_patch(context, excluded.context),
        source = excluded.source,
        updated_at = excluded.updated_at
      RETURNING *
    `)

    const result = stmt.get(
      id,
      input.type,
      input.subject_type,
      input.subject_id,
      input.object_type,
      input.object_id,
      JSON.stringify(input.context ?? {}),
      input.source ?? null,
      input.source_id ?? null,
      now,
      now
    ) as Record<string, unknown>

    return this.parseRelation(result)
  }

  queryRelations(options: QueryRelationsOptions = {}): Relation[] {
    let sql = `SELECT * FROM relations WHERE 1=1`
    const params: unknown[] = []

    if (options.type) {
      sql += ` AND type = ?`
      params.push(options.type)
    }
    if (options.subject_type) {
      sql += ` AND subject_type = ?`
      params.push(options.subject_type)
    }
    if (options.subject_id) {
      sql += ` AND subject_id = ?`
      params.push(options.subject_id)
    }
    if (options.object_type) {
      sql += ` AND object_type = ?`
      params.push(options.object_type)
    }
    if (options.object_id) {
      sql += ` AND object_id = ?`
      params.push(options.object_id)
    }

    const stmt = this.db.prepare(sql)
    const results = stmt.all(...params) as Record<string, unknown>[]
    return results.map((r) => this.parseRelation(r))
  }

  // ============================================
  // Business Queries (Common Scenarios)
  // ============================================

  getMyBookshelf(shelfId?: string): { shelf: Good; books: Good[] } {
    const consumer = this.getConsumer()

    let shelf: Good
    if (shelfId) {
      const g = this.getGood(shelfId)
      if (!g) throw new Error(`Shelf not found: ${shelfId}`)
      shelf = g
    } else {
      const shelves = this.queryGoods({
        category: "shelf",
        owner_id: consumer.id,
        limit: 1,
      })
      shelf = shelves[0]
    }

    const relations = this.queryRelations({
      type: "CONTAINS",
      subject_type: "good",
      subject_id: shelf.id,
    })

    const books = relations
      .map((r) => this.getGood(r.object_id))
      .filter((g): g is Good => g !== null && g.category === "book")

    return { shelf, books }
  }

  getMyFollowing(): Agent[] {
    const consumer = this.getConsumer()
    const relations = this.queryRelations({
      type: "FOLLOWS",
      subject_type: "agent",
      subject_id: consumer.id,
    })

    return relations
      .map((r) => this.getAgent(r.object_id))
      .filter((a): a is Agent => a !== null)
  }

  getProducerWorks(producerId: string): Good[] {
    return this.queryGoods({ produced_by: producerId })
  }

  getMyConsumption(
    category?: string
  ): Array<{ good: Good; context: Record<string, unknown> }> {
    const consumer = this.getConsumer()
    const relations = this.queryRelations({
      type: "CONSUMES",
      subject_type: "agent",
      subject_id: consumer.id,
    })

    return relations
      .map((r) => {
        const good = this.getGood(r.object_id)
        const context =
          typeof r.context === "string" ? JSON.parse(r.context) : r.context
        return good && (!category || good.category === category)
          ? { good, context: context as Record<string, unknown> }
          : null
      })
      .filter(
        (item): item is { good: Good; context: Record<string, unknown> } =>
          item !== null
      )
  }

  // ============================================
  // Sync Operations (Adapter Data Import)
  // ============================================

  syncFromAdapter(
    source: string,
    result: AdapterSyncResult
  ): { added: number; updated: number } {
    const transaction = this.db.transaction(() => {
      let added = 0
      let updated = 0
      const agentIdMap = new Map<string, string>()

      // 1. Process Agents
      for (const agent of result.agents) {
        const existing = this.findAgentByFingerprint(source, agent.external_id)
        const fingerprints = {
          ...(agent.fingerprints ?? {}),
          [source]: agent.external_id,
        }

        const created = this.createAgent({
          id: existing?.id,
          role: (agent.role ?? "producer") as AgentRole,
          name: agent.name,
          fingerprints,
          description: agent.description,
        })

        agentIdMap.set(agent.external_id, created.id)
        if (!existing) added++
        else updated++
      }

      // 2. Process Goods
      for (const good of result.goods) {
        const fingerprints = {
          ...(good.fingerprints ?? {}),
          [source]: good.external_id,
        }
        const producerId = good.produced_by_external_id
          ? agentIdMap.get(good.produced_by_external_id)
          : undefined

        const existing = this.findGoodByFingerprint(source, good.external_id)

        this.createGood({
          id: existing?.id,
          category: good.category as GoodCategory,
          title: good.title,
          summary: good.summary,
          produced_by: producerId,
          fingerprints,
          use_value: good.use_value,
          exchange_value: good.exchange_value,
          production_data:
            typeof existing?.production_data === "string"
              ? JSON.parse(existing.production_data)
              : (existing?.production_data ?? {}),
        })

        if (!existing) added++
        else updated++
      }

      // 3. Process Relations
      for (const rel of result.relations) {
        this.createRelation({
          type: rel.type as RelationType,
          subject_type: "agent",
          subject_id:
            agentIdMap.get(rel.subject_external_id) ?? rel.subject_external_id,
          object_type: "good",
          object_id:
            agentIdMap.get(rel.object_external_id) ?? rel.object_external_id,
          context: rel.context,
          source,
        })
      }

      return { added, updated }
    })

    return transaction()
  }

  // ============================================
  // Parsing Helper Methods
  // ============================================

  private parseAgent(row: Record<string, unknown>): Agent {
    return {
      id: row.id as string,
      role: row.role as Agent["role"],
      is_consumer: Boolean(row.is_consumer),
      name: row.name as string,
      avatar_url: row.avatar_url as string | undefined,
      fingerprints: JSON.parse(row.fingerprints as string),
      description: row.description as string | undefined,
      created_at: row.created_at as number,
      updated_at: row.updated_at as number,
    }
  }

  private parseGood(row: Record<string, unknown>): Good {
    return {
      id: row.id as string,
      category: row.category as Good["category"],
      title: row.title as string,
      summary: row.summary as string | undefined,
      is_container: Boolean(row.is_container),
      owner_id: row.owner_id as string | undefined,
      produced_by: row.produced_by as string | undefined,
      co_producers: JSON.parse(row.co_producers as string),
      fingerprints: JSON.parse(row.fingerprints as string),
      use_value: JSON.parse(row.use_value as string),
      exchange_value: JSON.parse(row.exchange_value as string),
      production_data: JSON.parse(row.production_data as string),
      container_rules: row.container_rules
        ? JSON.parse(row.container_rules as string)
        : undefined,
      status: row.status as Good["status"],
      created_at: row.created_at as number,
      published_at: row.published_at as number | undefined,
      updated_at: row.updated_at as number,
    }
  }

  private parseRelation(row: Record<string, unknown>): Relation {
    return {
      id: row.id as string,
      type: row.type as Relation["type"],
      subject_type: row.subject_type as Relation["subject_type"],
      subject_id: row.subject_id as string,
      object_type: row.object_type as Relation["object_type"],
      object_id: row.object_id as string,
      context: JSON.parse(row.context as string),
      source: row.source as string | undefined,
      source_id: row.source_id as string | undefined,
      created_at: row.created_at as number,
      updated_at: row.updated_at as number,
    }
  }
}
