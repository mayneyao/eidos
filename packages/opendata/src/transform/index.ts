/**
 * Transform Protocol Module
 * Transforms raw data into economic model (agents, goods, relations)
 */

import type {
  AgentRole,
  GoodCategory,
  RelationType,
  EntityType,
  CreateAgentInput,
  CreateGoodInput,
  CreateRelationInput,
} from "../types.js"

/**
 * Field mapping configuration
 * Supports JSONPath-like syntax for extracting values from raw data
 */
export interface FieldMapping {
  source: string // Source field path (e.g., '$.title', 'author.name')
  transform?: string // Transform function (e.g., 'uppercase', 'date')
  default?: any // Default value if source is null
  format?: string // Format string for composing values
}

/**
 * Agent transformation configuration
 */
export interface AgentTransformConfig {
  entityType: string // Raw entity type that maps to agent
  role: AgentRole
  name: FieldMapping
  fingerprints?: Record<string, FieldMapping>
  description?: FieldMapping
  avatar_url?: FieldMapping
}

/**
 * Good transformation configuration
 */
export interface GoodTransformConfig {
  entityType: string // Raw entity type that maps to good
  category: GoodCategory
  title: FieldMapping
  summary?: FieldMapping
  fingerprints?: Record<string, FieldMapping>
  use_value?: Record<string, FieldMapping>
  exchange_value?: Record<string, FieldMapping>
  is_container?: FieldMapping
}

/**
 * Relation transformation configuration
 */
export interface RelationTransformConfig {
  type: RelationType
  subject: {
    entityType: string
    idField: FieldMapping
    type: EntityType
  }
  object: {
    entityType: string
    idField: FieldMapping
    type: EntityType
  }
  context?: Record<string, FieldMapping>
}

/**
 * Complete transform configuration for a source
 */
export interface TransformConfig {
  version: number
  source: string
  description?: string

  // Entity mappings
  agents?: AgentTransformConfig[]
  goods?: GoodTransformConfig[]

  // Relation mappings (typically cross-entity)
  relations?: RelationTransformConfig[]

  // Custom transform function (optional, overrides default mapping)
  customTransform?: string // JavaScript/TypeScript code
}

/**
 * Transform context passed to custom transform functions
 */
export interface TransformContext {
  source: string
  rawData: any
  entityType: string
  helpers: {
    extract: (path: string, data?: any) => any
    extractString: (path: string, defaultValue?: string) => string
    extractNumber: (path: string, defaultValue?: number) => number
    extractDate: (path: string) => number | undefined
    slugify: (text: string) => string
    hash: (data: string) => string
  }
}

/**
 * Transform registry - stores transform configs by source
 */
export class TransformRegistry {
  private configs = new Map<string, TransformConfig>()

  register(config: TransformConfig): void {
    this.configs.set(config.source, config)
  }

  get(source: string): TransformConfig | undefined {
    return this.configs.get(source)
  }

  unregister(source: string): boolean {
    return this.configs.delete(source)
  }

  list(): TransformConfig[] {
    return Array.from(this.configs.values())
  }
}

/**
 * Default transform registry instance
 */
export const defaultRegistry = new TransformRegistry()

/**
 * Built-in transform helpers
 */
export const transformHelpers = {
  /**
   * Extract value from object using path notation
   * Supports: $.field, $.nested.field, $.array[0].field
   */
  extract(path: string, data: any): any {
    if (!path || !data) return undefined

    // Remove leading $.
    const cleanPath = path.startsWith("$.") ? path.slice(2) : path
    const parts = cleanPath.split(/\.|\[|\]/).filter(Boolean)

    let current = data
    for (const part of parts) {
      if (current === null || current === undefined) return undefined

      // Handle array index
      const index = parseInt(part, 10)
      if (!isNaN(index) && Array.isArray(current)) {
        current = current[index]
      } else {
        current = current[part]
      }
    }

    return current
  },

  extractString(path: string, data: any, defaultValue?: string): string {
    const value = this.extract(path, data)
    if (value === null || value === undefined) return defaultValue || ""
    return String(value)
  },

  extractNumber(
    path: string,
    data: any,
    defaultValue?: number
  ): number | undefined {
    const value = this.extract(path, data)
    if (value === null || value === undefined) return defaultValue
    const num = Number(value)
    return isNaN(num) ? defaultValue : num
  },

  extractDate(path: string, data: any): number | undefined {
    const value = this.extract(path, data)
    if (!value) return undefined
    const date = new Date(value)
    return isNaN(date.getTime()) ? undefined : Math.floor(date.getTime() / 1000)
  },

  slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  },

  simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(36)
  },
}

/**
 * Transform a single field using mapping config
 */
function transformField(mapping: FieldMapping, rawData: any): any {
  let value = transformHelpers.extract(mapping.source, rawData)

  if (value === null || value === undefined) {
    value = mapping.default
  }

  if (value !== undefined && mapping.format) {
    value = mapping.format.replace(/\{\{value\}\}/g, String(value))
  }

  // TODO: Apply transform functions

  return value
}

/**
 * Transform raw data to Agent input
 */
export function transformToAgent(
  rawData: any,
  config: AgentTransformConfig
): CreateAgentInput {
  const fingerprints: Record<string, string> = {}

  if (config.fingerprints) {
    for (const [key, mapping] of Object.entries(config.fingerprints)) {
      const value = transformField(mapping, rawData)
      if (value !== undefined) {
        fingerprints[key] = String(value)
      }
    }
  }

  return {
    role: config.role,
    name: transformField(config.name, rawData),
    fingerprints,
    description: config.description
      ? transformField(config.description, rawData)
      : undefined,
    avatar_url: config.avatar_url
      ? transformField(config.avatar_url, rawData)
      : undefined,
  }
}

/**
 * Transform raw data to Good input
 */
export function transformToGood(
  rawData: any,
  config: GoodTransformConfig
): CreateGoodInput {
  const fingerprints: Record<string, string> = {}
  const use_value: Record<string, unknown> = {}
  const exchange_value: Record<string, unknown> = {}

  if (config.fingerprints) {
    for (const [key, mapping] of Object.entries(config.fingerprints)) {
      const value = transformField(mapping, rawData)
      if (value !== undefined) {
        fingerprints[key] = String(value)
      }
    }
  }

  if (config.use_value) {
    for (const [key, mapping] of Object.entries(config.use_value)) {
      use_value[key] = transformField(mapping, rawData)
    }
  }

  if (config.exchange_value) {
    for (const [key, mapping] of Object.entries(config.exchange_value)) {
      exchange_value[key] = transformField(mapping, rawData)
    }
  }

  return {
    category: config.category,
    title: transformField(config.title, rawData),
    summary: config.summary
      ? transformField(config.summary, rawData)
      : undefined,
    fingerprints,
    use_value,
    exchange_value,
    is_container: config.is_container
      ? transformField(config.is_container, rawData)
      : false,
  }
}

/**
 * Transform raw data to Relation input
 */
export function transformToRelation(
  rawData: any,
  config: RelationTransformConfig,
  resolveId: (entityType: string, rawId: string) => string | undefined
): CreateRelationInput | null {
  const subjectId = transformField(config.subject.idField, rawData)
  const objectId = transformField(config.object.idField, rawData)

  if (!subjectId || !objectId) return null

  const context: Record<string, unknown> = {}
  if (config.context) {
    for (const [key, mapping] of Object.entries(config.context)) {
      context[key] = transformField(mapping, rawData)
    }
  }

  return {
    type: config.type,
    subject_type: config.subject.type,
    subject_id:
      resolveId(config.subject.entityType, String(subjectId)) ||
      String(subjectId),
    object_type: config.object.type,
    object_id:
      resolveId(config.object.entityType, String(objectId)) || String(objectId),
    context,
  }
}
