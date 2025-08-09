/**
 * SQL Meta Table Trigger Generator
 * 
 * Provides utility functions to generate standardized triggers for meta tables
 * that emit events for INSERT and UPDATE operations.
 */

export interface TriggerField {
  name: string
  type?: 'TEXT' | 'INTEGER' | 'REAL' | 'BOOLEAN' | 'TIMESTAMP'
}

export type TriggerOperation = 'insert' | 'update' | 'delete' | 'both' | 'all'

export interface TriggerOptions {
  tableName: string
  fields: TriggerField[]
  /**
   * Which operations to generate triggers for (default: 'both')
   */
  operations?: TriggerOperation
  /**
   * Custom trigger name suffix, defaults to standard naming
   */
  triggerSuffix?: {
    insert?: string
    update?: string
    delete?: string
  }
  /**
   * Whether to create temporary triggers (default: true)
   */
  temporary?: boolean
  /**
   * Custom event function names
   */
  eventFunctions?: {
    insert?: string
    update?: string
    delete?: string
  }
}

/**
 * Generate JSON object SQL for the given fields
 */
function generateJsonObject(fields: TriggerField[], prefix: 'new' | 'old'): string {
  const fieldPairs = fields.map(field => `'${field.name}', ${prefix}.${field.name}`).join(',\n        ')
  return `json_object(
        ${fieldPairs}
      )`
}

/**
 * Generate INSERT trigger SQL
 */
export function generateInsertTrigger(options: TriggerOptions): string {
  const {
    tableName,
    fields,
    triggerSuffix = {},
    temporary = true,
    eventFunctions = {}
  } = options

  const triggerName = `${tableName}_${triggerSuffix.insert || 'insert_trigger'}`
  const tempKeyword = temporary ? 'TEMP ' : ''
  const eventFunction = eventFunctions.insert || 'eidos_meta_table_event_insert'
  const jsonObject = generateJsonObject(fields, 'new')

  return `CREATE ${tempKeyword}TRIGGER IF NOT EXISTS ${triggerName}
  AFTER INSERT ON ${tableName}
  BEGIN
    SELECT ${eventFunction}(
      '${tableName}',
      ${jsonObject}
    );
  END;`
}

/**
 * Generate UPDATE trigger SQL
 */
export function generateUpdateTrigger(options: TriggerOptions): string {
  const {
    tableName,
    fields,
    triggerSuffix = {},
    temporary = true,
    eventFunctions = {}
  } = options

  const triggerName = `${tableName}_${triggerSuffix.update || 'update_trigger'}`
  const tempKeyword = temporary ? 'TEMP ' : ''
  const eventFunction = eventFunctions.update || 'eidos_meta_table_event_update'
  const newJsonObject = generateJsonObject(fields, 'new')
  const oldJsonObject = generateJsonObject(fields, 'old')

  return `CREATE ${tempKeyword}TRIGGER IF NOT EXISTS ${triggerName}
  AFTER UPDATE ON ${tableName}
  BEGIN
    SELECT ${eventFunction}(
      '${tableName}',
      ${newJsonObject},
      ${oldJsonObject}
    );
  END;`
}

/**
 * Generate DELETE trigger SQL
 */
export function generateDeleteTrigger(options: TriggerOptions): string {
  const {
    tableName,
    fields,
    triggerSuffix = {},
    temporary = true,
    eventFunctions = {}
  } = options

  const triggerName = `${tableName}_${triggerSuffix.delete || 'delete_trigger'}`
  const tempKeyword = temporary ? 'TEMP ' : ''
  const eventFunction = eventFunctions.delete || 'eidos_meta_table_event_delete'
  const jsonObject = generateJsonObject(fields, 'old')

  return `CREATE ${tempKeyword}TRIGGER IF NOT EXISTS ${triggerName}
  AFTER DELETE ON ${tableName}
  BEGIN
    SELECT ${eventFunction}(
      '${tableName}',
      ${jsonObject}
    );
  END;`
}

/**
 * Generate INSERT, UPDATE, and/or DELETE triggers
 */
export function generateMetaTableTriggers(options: TriggerOptions): string {
  const { operations = 'both' } = options
  const triggers: string[] = []
  
  if (operations === 'insert' || operations === 'both' || operations === 'all') {
    triggers.push(generateInsertTrigger(options))
  }
  
  if (operations === 'update' || operations === 'both' || operations === 'all') {
    triggers.push(generateUpdateTrigger(options))
  }
  
  if (operations === 'delete' || operations === 'all') {
    triggers.push(generateDeleteTrigger(options))
  }
  
  return triggers.join('\n\n  ')
}

/**
 * Convenience function to create triggers with field names only
 */
export function createTriggersForFields(
  tableName: string, 
  fieldNames: string[], 
  operations: TriggerOperation = 'both'
): string {
  const fields: TriggerField[] = fieldNames.map(name => ({ name }))
  return generateMetaTableTriggers({ tableName, fields, operations })
}

/**
 * Convenience function to create only INSERT trigger
 */
export function createInsertTriggerForFields(tableName: string, fieldNames: string[]): string {
  return createTriggersForFields(tableName, fieldNames, 'insert')
}

/**
 * Convenience function to create only UPDATE trigger
 */
export function createUpdateTriggerForFields(tableName: string, fieldNames: string[]): string {
  return createTriggersForFields(tableName, fieldNames, 'update')
}

/**
 * Convenience function to create only DELETE trigger
 */
export function createDeleteTriggerForFields(tableName: string, fieldNames: string[]): string {
  return createTriggersForFields(tableName, fieldNames, 'delete')
}

/**
 * Convenience function to create all triggers (INSERT, UPDATE, DELETE)
 */
export function createAllTriggersForFields(tableName: string, fieldNames: string[]): string {
  return createTriggersForFields(tableName, fieldNames, 'all')
} 