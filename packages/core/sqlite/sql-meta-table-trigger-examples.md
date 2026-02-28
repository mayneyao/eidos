# SQL Meta Table Trigger Generator Usage Examples

This module provides utility functions to generate standardized meta table triggers that emit events for INSERT and UPDATE operations.

## Basic Usage

### 1. Generate INSERT and UPDATE Triggers (Default Behavior)

```typescript
import { createTriggersForFields } from "./sql-meta-table-trigger"

// Generate complete INSERT and UPDATE triggers
const triggers = createTriggersForFields("tree_table", [
  "id",
  "name",
  "type",
  "parent_id",
  "is_pinned",
  "is_full_width",
  "is_locked",
  "icon",
  "cover",
  "is_deleted",
  "hide_properties",
  "position",
  "created_at",
  "updated_at",
])

// Use in createTableSql
createTableSql = `
  CREATE TABLE IF NOT EXISTS tree_table (
    id TEXT PRIMARY KEY,
    name TEXT,
    -- other fields...
  );
  
  ${triggers}
`
```

### 2. Generate INSERT Trigger Only

Suitable for tables that only need to listen to insert operations, such as Chat table:

```typescript
import { createInsertTriggerForFields } from "./sql-meta-table-trigger"

const insertTrigger = createInsertTriggerForFields("chat_table", [
  "id",
  "title",
  "user_id",
  "project_id",
  "created_at",
])

// Or use operation parameter
import { createTriggersForFields } from "./sql-meta-table-trigger"

const insertTrigger = createTriggersForFields(
  "chat_table",
  ["id", "title", "user_id", "project_id", "created_at"],
  "insert"
)
```

### 3. Generate UPDATE Trigger Only

Suitable for tables that only need to listen to update operations:

```typescript
import { createUpdateTriggerForFields } from "./sql-meta-table-trigger"

const updateTrigger = createUpdateTriggerForFields("settings_table", [
  "id",
  "key",
  "value",
  "updated_at",
])

// Or use operation parameter
const updateTrigger = createTriggersForFields(
  "settings_table",
  ["id", "key", "value", "updated_at"],
  "update"
)
```

## Advanced Usage

### Custom Trigger Options

```typescript
import { generateMetaTableTriggers } from "./sql-meta-table-trigger"

const customTriggers = generateMetaTableTriggers({
  tableName: "custom_table",
  fields: [{ name: "id" }, { name: "name" }, { name: "status" }],
  operations: "insert", // 'insert' | 'update' | 'both'
  temporary: false, // Generate permanent triggers instead of temporary ones
  triggerSuffix: {
    insert: "on_create",
    update: "on_modify",
  },
  eventFunctions: {
    insert: "custom_insert_handler",
    update: "custom_update_handler",
  },
})
```

### Usage in Existing Meta Table Classes

```typescript
// TreeTable example
export class TreeTable extends BaseTableImpl implements BaseTable<ITreeNode> {
  name = TreeTableName
  createTableSql = `
    CREATE TABLE IF NOT EXISTS ${TreeTableName} (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      parent_id TEXT NULL,
      is_pinned BOOLEAN DEFAULT 0,
      is_full_width BOOLEAN DEFAULT 0,
      is_locked BOOLEAN DEFAULT 0,
      icon TEXT NULL,
      cover TEXT NULL,
      is_deleted BOOLEAN DEFAULT 0,
      hide_properties BOOLEAN DEFAULT 0,
      position REAL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    ${createTriggersForFields(TreeTableName, [
      "id",
      "name",
      "type",
      "parent_id",
      "is_pinned",
      "is_full_width",
      "is_locked",
      "icon",
      "cover",
      "is_deleted",
      "hide_properties",
      "position",
      "created_at",
      "updated_at",
    ])}
  `
}

// MessageTable example - INSERT trigger only
export class MessageTable extends BaseTableImpl<ChatMessage> {
  name = MessageTableName
  createTableSql = `
    CREATE TABLE IF NOT EXISTS ${MessageTableName} (
      id TEXT PRIMARY KEY,
      chat_id TEXT,
      role TEXT,
      content TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(chat_id) REFERENCES chat_table(id)
    );

    ${createInsertTriggerForFields(MessageTableName, [
      "id",
      "chat_id",
      "role",
      "content",
      "created_at",
    ])}
  `
}

// ScriptTable example - UPDATE trigger only
export class ScriptTable extends BaseTableImpl<IScript> {
  name = ScriptTableName
  createTableSql = `
    CREATE TABLE IF NOT EXISTS ${ScriptTableName} (
      id TEXT PRIMARY KEY,
      name TEXT,
      code TEXT,
      enabled BOOLEAN DEFAULT 0,
      -- other fields...
    );

    ${createUpdateTriggerForFields(ScriptTableName, ["id", "type", "name", "code", "enabled"])}
  `
}
```

## API Reference

### Main Functions

- `createTriggersForFields(tableName, fieldNames, operations?)` - Convenience function to create triggers from field name array
- `createInsertTriggerForFields(tableName, fieldNames)` - Create INSERT trigger only
- `createUpdateTriggerForFields(tableName, fieldNames)` - Create UPDATE trigger only
- `generateMetaTableTriggers(options)` - Full-featured trigger generator with complete configuration

### Type Definitions

```typescript
type TriggerOperation = "insert" | "update" | "both"

interface TriggerField {
  name: string
  type?: "TEXT" | "INTEGER" | "REAL" | "BOOLEAN" | "TIMESTAMP"
}

interface TriggerOptions {
  tableName: string
  fields: TriggerField[]
  operations?: TriggerOperation
  triggerSuffix?: {
    insert?: string
    update?: string
  }
  temporary?: boolean
  eventFunctions?: {
    insert?: string
    update?: string
  }
}
```

## Migrating Existing Code

Replace existing manual triggers:

```typescript
// Old code
createTableSql = `
  CREATE TABLE IF NOT EXISTS tree_table (...);
  
  CREATE TEMP TRIGGER IF NOT EXISTS tree_table_insert_trigger
  AFTER INSERT ON tree_table
  BEGIN
    SELECT eidos_meta_table_event_insert(
      'tree_table',
      json_object(
        'id', new.id,
        'name', new.name,
        -- all fields...
      )
    );
  END;
  
  CREATE TEMP TRIGGER IF NOT EXISTS tree_table_update_trigger
  AFTER UPDATE ON tree_table
  BEGIN
    SELECT eidos_meta_table_event_update(
      'tree_table',
      json_object('id', new.id, 'name', new.name, ...),
      json_object('id', old.id, 'name', old.name, ...)
    );
  END;
`

// New code
createTableSql = `
  CREATE TABLE IF NOT EXISTS tree_table (...);
  
  ${createTriggersForFields("tree_table", [
    "id",
    "name",
    "type",
    "parent_id",
    "is_pinned",
    // other fields...
  ])}
`
```

This approach significantly reduces boilerplate code, improves maintainability, and ensures trigger consistency.
