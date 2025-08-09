import type {
  TriggerField 
} from './sql-meta-table-trigger';
import { 
  generateInsertTrigger, 
  generateUpdateTrigger,
  generateDeleteTrigger, 
  generateMetaTableTriggers,
  createTriggersForFields,
  createInsertTriggerForFields,
  createUpdateTriggerForFields,
  createDeleteTriggerForFields,
  createAllTriggersForFields 
} from './sql-meta-table-trigger'

describe('SQL Meta Table Trigger Generator', () => {
  
  describe('generateInsertTrigger', () => {
    it('should generate basic INSERT trigger', () => {
      const fields: TriggerField[] = [
        { name: 'id' },
        { name: 'name' },
        { name: 'type' }
      ]
      
      const result = generateInsertTrigger({
        tableName: 'test_table',
        fields
      })
      
      expect(result).toContain('CREATE TEMP TRIGGER IF NOT EXISTS test_table_insert_trigger')
      expect(result).toContain('AFTER INSERT ON test_table')
      expect(result).toContain("SELECT eidos_meta_table_event_insert(")
      expect(result).toContain("'test_table',")
      expect(result).toContain("'id', new.id")
      expect(result).toContain("'name', new.name")
      expect(result).toContain("'type', new.type")
    })

    it('should support custom trigger suffix', () => {
      const result = generateInsertTrigger({
        tableName: 'test_table',
        fields: [{ name: 'id' }],
        triggerSuffix: { insert: 'custom_insert' }
      })
      
      expect(result).toContain('test_table_custom_insert')
    })

    it('should support non-temporary triggers', () => {
      const result = generateInsertTrigger({
        tableName: 'test_table',
        fields: [{ name: 'id' }],
        temporary: false
      })
      
      expect(result).toContain('CREATE TRIGGER IF NOT EXISTS')
      expect(result).not.toContain('CREATE TEMP TRIGGER')
    })

    it('should support custom event function', () => {
      const result = generateInsertTrigger({
        tableName: 'test_table',
        fields: [{ name: 'id' }],
        eventFunctions: { insert: 'custom_insert_event' }
      })
      
      expect(result).toContain('SELECT custom_insert_event(')
    })
  })

  describe('generateUpdateTrigger', () => {
    it('should generate basic UPDATE trigger with both new and old values', () => {
      const fields: TriggerField[] = [
        { name: 'id' },
        { name: 'name' }
      ]
      
      const result = generateUpdateTrigger({
        tableName: 'test_table',
        fields
      })
      
      expect(result).toContain('CREATE TEMP TRIGGER IF NOT EXISTS test_table_update_trigger')
      expect(result).toContain('AFTER UPDATE ON test_table')
      expect(result).toContain("SELECT eidos_meta_table_event_update(")
      expect(result).toContain("'id', new.id")
      expect(result).toContain("'id', old.id")
      expect(result).toContain("'name', new.name")
      expect(result).toContain("'name', old.name")
    })
  })

  describe('generateDeleteTrigger', () => {
    it('should generate basic DELETE trigger with old values', () => {
      const fields: TriggerField[] = [
        { name: 'id' },
        { name: 'name' }
      ]
      
      const result = generateDeleteTrigger({
        tableName: 'test_table',
        fields
      })
      
      expect(result).toContain('CREATE TEMP TRIGGER IF NOT EXISTS test_table_delete_trigger')
      expect(result).toContain('AFTER DELETE ON test_table')
      expect(result).toContain("SELECT eidos_meta_table_event_delete(")
      expect(result).toContain("'id', old.id")
      expect(result).toContain("'name', old.name")
    })

    it('should support custom event function', () => {
      const result = generateDeleteTrigger({
        tableName: 'test_table',
        fields: [{ name: 'id' }],
        eventFunctions: { delete: 'custom_delete_event' }
      })
      
      expect(result).toContain('SELECT custom_delete_event(')
    })
  })

  describe('generateMetaTableTriggers', () => {
    it('should generate both INSERT and UPDATE triggers', () => {
      const fields: TriggerField[] = [
        { name: 'id' },
        { name: 'name' }
      ]
      
      const result = generateMetaTableTriggers({
        tableName: 'test_table',
        fields
      })
      
      expect(result).toContain('test_table_insert_trigger')
      expect(result).toContain('test_table_update_trigger')
      expect(result).toContain('eidos_meta_table_event_insert')
      expect(result).toContain('eidos_meta_table_event_update')
    })

    it('should generate only DELETE trigger when specified', () => {
      const fields: TriggerField[] = [
        { name: 'id' },
        { name: 'name' }
      ]
      
      const result = generateMetaTableTriggers({
        tableName: 'test_table',
        fields,
        operations: 'delete'
      })
      
      expect(result).toContain('test_table_delete_trigger')
      expect(result).toContain('eidos_meta_table_event_delete')
      expect(result).not.toContain('test_table_insert_trigger')
      expect(result).not.toContain('test_table_update_trigger')
    })

    it('should generate all triggers when operations is "all"', () => {
      const fields: TriggerField[] = [
        { name: 'id' },
        { name: 'name' }
      ]
      
      const result = generateMetaTableTriggers({
        tableName: 'test_table',
        fields,
        operations: 'all'
      })
      
      expect(result).toContain('test_table_insert_trigger')
      expect(result).toContain('test_table_update_trigger')
      expect(result).toContain('test_table_delete_trigger')
      expect(result).toContain('eidos_meta_table_event_insert')
      expect(result).toContain('eidos_meta_table_event_update')
      expect(result).toContain('eidos_meta_table_event_delete')
    })
  })

  describe('createTriggersForFields', () => {
    it('should create triggers from field names array', () => {
      const result = createTriggersForFields('tree_table', [
        'id', 'name', 'type', 'parent_id', 'is_pinned'
      ])
      
      expect(result).toContain('tree_table_insert_trigger')
      expect(result).toContain('tree_table_update_trigger')
      expect(result).toContain("'id', new.id")
      expect(result).toContain("'name', new.name")
      expect(result).toContain("'type', new.type")
      expect(result).toContain("'parent_id', new.parent_id")
      expect(result).toContain("'is_pinned', new.is_pinned")
    })

    it('should create only INSERT trigger when specified', () => {
      const result = createTriggersForFields('test_table', ['id', 'name'], 'insert')
      
      expect(result).toContain('test_table_insert_trigger')
      expect(result).not.toContain('test_table_update_trigger')
      expect(result).toContain('eidos_meta_table_event_insert')
      expect(result).not.toContain('eidos_meta_table_event_update')
    })

    it('should create only UPDATE trigger when specified', () => {
      const result = createTriggersForFields('test_table', ['id', 'name'], 'update')
      
      expect(result).not.toContain('test_table_insert_trigger')
      expect(result).toContain('test_table_update_trigger')
      expect(result).not.toContain('eidos_meta_table_event_insert')
      expect(result).toContain('eidos_meta_table_event_update')
    })
  })

  describe('Convenience functions', () => {
    describe('createInsertTriggerForFields', () => {
      it('should create only INSERT trigger', () => {
        const result = createInsertTriggerForFields('test_table', ['id', 'name'])
        
        expect(result).toContain('test_table_insert_trigger')
        expect(result).not.toContain('test_table_update_trigger')
        expect(result).toContain('eidos_meta_table_event_insert')
        expect(result).not.toContain('eidos_meta_table_event_update')
        expect(result).toContain("'id', new.id")
        expect(result).toContain("'name', new.name")
      })
    })

    describe('createUpdateTriggerForFields', () => {
      it('should create only UPDATE trigger', () => {
        const result = createUpdateTriggerForFields('test_table', ['id', 'name'])
        
        expect(result).not.toContain('test_table_insert_trigger')
        expect(result).toContain('test_table_update_trigger')
        expect(result).not.toContain('eidos_meta_table_event_insert')
        expect(result).toContain('eidos_meta_table_event_update')
        expect(result).toContain("'id', new.id")
        expect(result).toContain("'name', new.name")
        expect(result).toContain("'id', old.id")
        expect(result).toContain("'name', old.name")
      })
    })

    describe('createDeleteTriggerForFields', () => {
      it('should create only DELETE trigger', () => {
        const result = createDeleteTriggerForFields('test_table', ['id', 'name'])
        
        expect(result).not.toContain('test_table_insert_trigger')
        expect(result).not.toContain('test_table_update_trigger')
        expect(result).toContain('test_table_delete_trigger')
        expect(result).not.toContain('eidos_meta_table_event_insert')
        expect(result).not.toContain('eidos_meta_table_event_update')
        expect(result).toContain('eidos_meta_table_event_delete')
        expect(result).toContain("'id', old.id")
        expect(result).toContain("'name', old.name")
      })
    })

    describe('createAllTriggersForFields', () => {
      it('should create INSERT, UPDATE, and DELETE triggers', () => {
        const result = createAllTriggersForFields('test_table', ['id', 'name'])
        
        expect(result).toContain('test_table_insert_trigger')
        expect(result).toContain('test_table_update_trigger')
        expect(result).toContain('test_table_delete_trigger')
        expect(result).toContain('eidos_meta_table_event_insert')
        expect(result).toContain('eidos_meta_table_event_update')
        expect(result).toContain('eidos_meta_table_event_delete')
        expect(result).toContain("'id', new.id")
        expect(result).toContain("'name', new.name")
        expect(result).toContain("'id', old.id")
        expect(result).toContain("'name', old.name")
      })
    })
  })

  describe('generateMetaTableTriggers with operations control', () => {
    const fields: TriggerField[] = [{ name: 'id' }, { name: 'name' }]

    it('should generate both triggers by default', () => {
      const result = generateMetaTableTriggers({
        tableName: 'test_table',
        fields
      })
      
      expect(result).toContain('test_table_insert_trigger')
      expect(result).toContain('test_table_update_trigger')
    })

    it('should generate only INSERT trigger when operations is "insert"', () => {
      const result = generateMetaTableTriggers({
        tableName: 'test_table',
        fields,
        operations: 'insert'
      })
      
      expect(result).toContain('test_table_insert_trigger')
      expect(result).not.toContain('test_table_update_trigger')
    })

    it('should generate only UPDATE trigger when operations is "update"', () => {
      const result = generateMetaTableTriggers({
        tableName: 'test_table',
        fields,
        operations: 'update'
      })
      
      expect(result).not.toContain('test_table_insert_trigger')
      expect(result).toContain('test_table_update_trigger')
    })

    it('should generate both triggers when operations is "both"', () => {
      const result = generateMetaTableTriggers({
        tableName: 'test_table',
        fields,
        operations: 'both'
      })
      
      expect(result).toContain('test_table_insert_trigger')
      expect(result).toContain('test_table_update_trigger')
    })
  })

  describe('Real-world examples', () => {
    it('should match TreeTable trigger pattern', () => {
      const treeFields = [
        'id', 'name', 'type', 'parent_id', 'is_pinned', 
        'is_full_width', 'is_locked', 'icon', 'cover', 
        'is_deleted', 'hide_properties', 'position', 
        'created_at', 'updated_at'
      ]
      
      const result = createTriggersForFields('tree_table', treeFields)
      
      // Should contain all the fields from the original TreeTable
      treeFields.forEach(field => {
        expect(result).toContain(`'${field}', new.${field}`)
        expect(result).toContain(`'${field}', old.${field}`)
      })
    })

    it('should match MessageTable trigger pattern', () => {
      const messageFields = [
        'id', 'chat_id', 'role', 'content', 'created_at'
      ]
      
      const result = createTriggersForFields('message_table', messageFields)
      
      messageFields.forEach(field => {
        expect(result).toContain(`'${field}', new.${field}`)
      })
    })
  })
}) 