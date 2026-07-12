// IMPORTANT: Import env first to set SQLITE_USE_URI before better-sqlite3 is loaded
import "../../data-space/worker/sqlite-server/env"

import type { RawData } from "@eidos.space/rawdata"
import {
  SourceDataStore,
  type GoodCategory,
  type RawDataAdapter,
  type RawDataResult,
  type RelationType,
} from "@eidos.space/rawdata"
import type Database from "better-sqlite3"

import { Injectable } from "../../../common/di"

/**
 * Data Persister Service
 * Handles persisting adapter results to database in various formats
 */
@Injectable()
export class DataPersisterService {
  /**
   * Persist adapter results to database
   * Supports both economic format (agent/good/relations) and legacy format
   */
  async persistResults(
    store: RawData,
    db: Database.Database,
    adapter: RawDataAdapter,
    result: RawDataResult
  ): Promise<{ agents: number; goods: number; relations: number }> {
    const source = adapter.meta.site

    // Check if data is in V3 economic format (agents/goods/relations arrays)
    const resultWithModel = result as any
    const isV3EconomicFormat =
      resultWithModel.agents?.length > 0 ||
      resultWithModel.goods?.length > 0 ||
      resultWithModel.relations?.length > 0

    console.log(
      `[RawDataService] Format detection: isV3EconomicFormat=${isV3EconomicFormat}`
    )
    console.log(`[RawDataService] Agents:`, resultWithModel.agents?.length || 0)
    console.log(`[RawDataService] Goods:`, resultWithModel.goods?.length || 0)
    console.log(
      `[RawDataService] Relations:`,
      resultWithModel.relations?.length || 0
    )

    const transaction = store["db"].transaction(() => {
      if (isV3EconomicFormat) {
        console.log("[RawDataService] Using V3 economic format persister")
        return this.persistV3EconomicFormat(store, source, resultWithModel)
      } else if (
        result.data.length > 0 &&
        (result.data[0].agent || result.data[0].good)
      ) {
        console.log("[RawDataService] Using legacy economic format persister")
        return this.persistEconomicFormat(store, source, result.data)
      } else {
        console.log("[RawDataService] Using legacy format persister")
        return this.persistLegacyFormat(store, adapter, result.data)
      }
    })

    return transaction()
  }

  /**
   * Store raw data to data table
   */
  async storeRawData(
    db: Database.Database,
    source: string,
    rawEntities: any[]
  ): Promise<{ stored: number; changed: number }> {
    const sourceDataStore = new SourceDataStore(db)

    const rawDataRecords = rawEntities.map((entity) => ({
      source,
      entity_type: entity.entityType,
      entity_id: entity.entityId,
      data: JSON.stringify(entity.data),
      checksum: undefined,
      fetched_at: Date.now(),
      transformed_at: undefined,
      transform_version: 0,
    }))

    const changed = await sourceDataStore.upsertMany(rawDataRecords)
    console.log(
      `[RawData] Stored ${rawDataRecords.length} raw records, ${changed} changed`
    )

    return { stored: rawDataRecords.length, changed }
  }

  /**
   * Persist economic format data (trade protocol)
   */
  private persistEconomicFormat(
    store: RawData,
    source: string,
    data: any[]
  ): { agents: number; goods: number; relations: number } {
    let agents = 0,
      goods = 0,
      relations = 0
    const agentIdMap = new Map<string, string>() // external_id -> internal_id
    const goodIdMap = new Map<string, string>()

    // 1. Process all agents first
    for (const item of data) {
      if (item.agent) {
        const agentData = item.agent
        const externalId = agentData.external_id || agentData.name

        if (!agentIdMap.has(externalId)) {
          let agent = store.findAgentByFingerprint(source, externalId)
          if (!agent) {
            agent = store.createAgent({
              role: agentData.role || "producer",
              name: agentData.name,
              fingerprints: {
                [source]: externalId,
                ...(agentData.fingerprints || {}),
              },
              description: agentData.description,
            })
            agents++
          }
          agentIdMap.set(externalId, agent.id)
        }
      }
    }

    // 2. Process all goods
    for (const item of data) {
      if (item.good) {
        const goodData = item.good
        const externalId = goodData.external_id

        if (!goodIdMap.has(externalId)) {
          let good = store.findGoodByFingerprint(source, externalId)

          // Resolve producer reference
          let producedBy: string | undefined
          if (item.agent) {
            const producerExternalId = item.agent.external_id || item.agent.name
            producedBy = agentIdMap.get(producerExternalId)
          }

          good = store.createGood({
            id: good?.id,
            category: goodData.category,
            title: goodData.title,
            summary: goodData.summary,
            produced_by: producedBy,
            fingerprints: {
              [source]: externalId,
              ...(goodData.fingerprints || {}),
            },
            use_value: goodData.use_value || {},
            exchange_value: goodData.exchange_value || {},
            production_data: {
              ...(typeof good?.production_data === "string"
                ? JSON.parse(good.production_data)
                : good?.production_data || {}),
              [source]: { raw: item._raw || goodData, fetched_at: Date.now() },
            },
          })

          goodIdMap.set(externalId, good.id)
          goods++
        }
      }
    }

    // 3. Process all relations
    console.log(
      `[RawDataService] Processing relations for ${data.length} items`
    )
    console.log(
      `[RawDataService] goodIdMap keys:`,
      Array.from(goodIdMap.keys())
    )

    // Pre-load shelf IDs that might be referenced (e.g., 'shelf-default')
    const shelfIds = new Map<string, string>()
    for (const item of data) {
      if (item.relations) {
        for (const rel of item.relations) {
          console.log(
            `[RawDataService] Checking relation: type=${rel.type}, subject=${rel.subject_external_id}, subject_type=${rel.subject_type}`
          )
          if (
            rel.subject_type === "good" &&
            !goodIdMap.has(rel.subject_external_id)
          ) {
            // Try to find shelf by ID (for pre-created shelves like 'shelf-default')
            console.log(
              `[RawDataService] Looking for pre-created shelf: ${rel.subject_external_id}`
            )
            const shelf = store.getGood(rel.subject_external_id)
            if (shelf) {
              shelfIds.set(rel.subject_external_id, shelf.id)
              console.log(
                `[RawDataService] Found pre-created shelf: ${rel.subject_external_id} -> ${shelf.id}`
              )
            } else {
              console.log(
                `[RawDataService] Shelf not found: ${rel.subject_external_id}`
              )
            }
          }
        }
      }
    }
    console.log(
      `[RawDataService] shelfIds map:`,
      Array.from(shelfIds.entries())
    )

    for (const item of data) {
      if (item.relations && Array.isArray(item.relations)) {
        console.log(
          `[RawDataService] Processing ${item.relations.length} relations for item`
        )
        for (const rel of item.relations) {
          const subjectId =
            rel.subject_external_id === "me"
              ? store.getConsumer().id
              : agentIdMap.get(rel.subject_external_id) ||
                goodIdMap.get(rel.subject_external_id) ||
                shelfIds.get(rel.subject_external_id) ||
                rel.subject_external_id

          const objectId =
            rel.object_external_id === "me"
              ? store.getConsumer().id
              : goodIdMap.get(rel.object_external_id) ||
                agentIdMap.get(rel.object_external_id) ||
                rel.object_external_id

          console.log(
            `[RawDataService] Creating relation: ${rel.type} ${subjectId} -> ${objectId}`
          )

          store.createRelation({
            type: rel.type,
            subject_type: rel.subject_type,
            subject_id: subjectId,
            object_type: rel.object_type,
            object_id: objectId,
            source,
            context: rel.context || {},
          })
          relations++
        }
      }
    }

    console.log(
      `[RawDataService] Persisted: ${agents} agents, ${goods} goods, ${relations} relations`
    )
    return { agents, goods, relations }
  }

  /**
   * Persist V3 economic format data (agents/goods/relations arrays)
   */
  private persistV3EconomicFormat(
    store: RawData,
    source: string,
    result: { agents: any[]; goods: any[]; relations: any[] }
  ): { agents: number; goods: number; relations: number } {
    let agents = 0,
      goods = 0,
      relations = 0
    const agentIdMap = new Map<string, string>()
    const goodIdMap = new Map<string, string>()

    // 1. Process all agents
    for (const agentData of result.agents || []) {
      const externalId =
        agentData.fingerprints?.[source] || agentData.id || agentData.name

      if (!agentIdMap.has(externalId)) {
        let agent = store.findAgentByFingerprint(source, externalId)
        if (!agent) {
          agent = store.createAgent({
            role: agentData.role || "producer",
            name: agentData.name,
            fingerprints: {
              [source]: externalId,
              ...(agentData.fingerprints || {}),
            },
            description: agentData.description,
          })
          agents++
        }
        agentIdMap.set(externalId, agent.id)
      }
    }

    // 2. Process all goods
    for (const goodData of result.goods || []) {
      const externalId = goodData.fingerprints?.[source] || goodData.id

      if (!goodIdMap.has(externalId)) {
        let good = store.findGoodByFingerprint(source, externalId)

        // Resolve producer reference
        let producedBy: string | undefined
        if (goodData.producedBy) {
          producedBy = agentIdMap.get(goodData.producedBy)
        }

        good = store.createGood({
          id: good?.id,
          category: goodData.category,
          title: goodData.title,
          summary: goodData.summary,
          produced_by: producedBy,
          fingerprints: {
            [source]: externalId,
            ...(goodData.fingerprints || {}),
          },
          use_value: goodData.useValue || {},
          exchange_value: goodData.exchangeValue || {},
          production_data: {
            ...(typeof good?.production_data === "string"
              ? JSON.parse(good.production_data)
              : good?.production_data || {}),
            [source]: { raw: goodData, fetched_at: Date.now() },
          },
        })

        goodIdMap.set(externalId, good.id)
        goods++
      }
    }

    // 3. Process all relations
    for (const rel of result.relations || []) {
      let subjectId: string | undefined
      let objectId: string | undefined

      // Resolve subject
      if (rel.subject_type === "agent") {
        if (rel.subject_id === "me") {
          subjectId = store.getConsumer().id
        } else {
          subjectId = agentIdMap.get(rel.subject_id)
        }
      } else if (rel.subject_type === "good") {
        subjectId = goodIdMap.get(rel.subject_id) || rel.subject_id
      }

      // Resolve object
      if (rel.object_type === "agent") {
        if (rel.object_id === "me") {
          objectId = store.getConsumer().id
        } else {
          objectId = agentIdMap.get(rel.object_id)
        }
      } else if (rel.object_type === "good") {
        objectId = goodIdMap.get(rel.object_id) || rel.object_id
      }

      if (subjectId && objectId) {
        store.createRelation({
          type: rel.type,
          subject_type: rel.subject_type,
          subject_id: subjectId,
          object_type: rel.object_type,
          object_id: objectId,
          context: rel.context || {},
        })
        relations++
      }
    }

    console.log(
      `[RawDataService] V3 Persisted: ${agents} agents, ${goods} goods, ${relations} relations`
    )
    return { agents, goods, relations }
  }

  /**
   * Persist legacy format data (backward compatibility)
   */
  private persistLegacyFormat(
    store: RawData,
    adapter: RawDataAdapter,
    data: any[]
  ): { agents: number; goods: number; relations: number } {
    const source = adapter.meta.site
    let agents = 0,
      goods = 0,
      relations = 0

    // 1. Process agents (producers)
    const agentMap = new Map<string, string>()

    for (const row of data) {
      if (row.author || row.producer || row.creator) {
        const name = row.author || row.producer || row.creator
        const externalId = `${source}:${name}`

        let agent = store.findAgentByFingerprint(source, externalId)
        if (!agent) {
          agent = store.createAgent({
            role: "producer",
            name,
            fingerprints: { [source]: externalId },
          })
          agents++
        }
        agentMap.set(externalId, agent.id)
      }
    }

    // 2. Process goods
    const consumer = store.getConsumer()
    const goodMap = new Map<string, string>()

    for (const row of data) {
      const externalId =
        row.id || row.bookId || row.videoId || `${source}:${row.title}`
      const category = this.inferCategory(adapter, row)

      let good = store.findGoodByFingerprint(source, externalId)
      const producedBy =
        row.author || row.producer || row.creator
          ? agentMap.get(
              `${source}:${row.author || row.producer || row.creator}`
            )
          : undefined

      good = store.createGood({
        id: good?.id,
        category,
        title: row.title || row.name || "Untitled",
        summary: row.description || row.summary,
        produced_by: producedBy,
        fingerprints: {
          [source]: externalId,
          ...this.extractFingerprints(row),
        },
        use_value: this.extractUseValue(row),
        exchange_value: this.extractExchangeValue(row),
        production_data: {
          ...(typeof good?.production_data === "string"
            ? JSON.parse(good.production_data)
            : good?.production_data || {}),
          [source]: { raw: row, fetched_at: Date.now() },
        },
      })

      if (!goodMap.has(externalId)) goods++
      goodMap.set(externalId, good.id)

      // Create OWNS relation
      store.createRelation({
        type: "OWNS",
        subject_type: "agent",
        subject_id: consumer.id,
        object_type: "good",
        object_id: good.id,
        source,
        context: { imported_at: Date.now() },
      })
      relations++

      // Create CONSUMES relation if status present
      if (row.status || row.progress || row.rating) {
        store.createRelation({
          type: "CONSUMES",
          subject_type: "agent",
          subject_id: consumer.id,
          object_type: "good",
          object_id: good.id,
          source,
          context: {
            status: row.status,
            progress: row.progress,
            rating: row.rating,
            last_read: row.lastReadAt || row.updated_at,
          },
        })
      }
    }

    return { agents, goods, relations }
  }

  /**
   * Infer good category from adapter and data
   */
  private inferCategory(
    adapter: RawDataAdapter,
    row: Record<string, any>
  ): GoodCategory {
    const site = adapter.meta.site.toLowerCase()
    if (site.includes("book") || site.includes("read")) return "book"
    if (
      site.includes("video") ||
      site.includes("youtube") ||
      site.includes("bili")
    )
      return "video"
    if (
      site.includes("music") ||
      site.includes("audio") ||
      site.includes("spotify")
    )
      return "audio"
    if (site.includes("movie") || site.includes("douban"))
      return row.isbn ? "book" : "movie"
    if (row.isbn) return "book"
    if (row.duration || row.videoId) return "video"
    return "article"
  }

  /**
   * Extract fingerprints from row data
   */
  private extractFingerprints(
    row: Record<string, any>
  ): Record<string, string> {
    const fingerprints: Record<string, string> = {}
    if (row.isbn) fingerprints.isbn = row.isbn
    if (row.doi) fingerprints.doi = row.doi
    if (row.url) fingerprints.url = row.url
    return fingerprints
  }

  /**
   * Extract use value (content) from row
   */
  private extractUseValue(row: Record<string, any>): Record<string, any> {
    const {
      title,
      name,
      description,
      summary,
      content,
      text,
      pages,
      duration,
      ...rest
    } = row
    return {
      title,
      name,
      description,
      summary,
      content,
      text,
      pages,
      duration,
      ...rest,
    }
  }

  /**
   * Extract exchange value (metadata) from row
   */
  private extractExchangeValue(row: Record<string, any>): Record<string, any> {
    return {
      rating: row.rating,
      likes: row.likes,
      views: row.views,
      comments: row.comments,
      price: row.price,
      ...row.metadata,
    }
  }
}
