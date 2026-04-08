/**
 * OpenData Database Schema
 *
 * Three-table structure based on economics model:
 * - agents: Economic agents (consumers, producers)
 * - goods: Goods (content, containers)
 * - relations: Production relations (consumption, following, creation, containment)
 */

export const SCHEMA_VERSION = 1

/**
 * Create agents table (economic agents)
 */
export const CREATE_AGENTS_TABLE = `
CREATE TABLE IF NOT EXISTS opendata_agents (
  id TEXT PRIMARY KEY,
  role TEXT CHECK(role IN ('consumer', 'producer', 'platform')),
  is_consumer BOOLEAN DEFAULT FALSE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  fingerprints JSON DEFAULT '{}',
  description TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_agents_consumer ON opendata_agents(is_consumer);
CREATE INDEX IF NOT EXISTS idx_agents_role ON opendata_agents(role);
`

/**
 * Create goods table (goods/products)
 */
export const CREATE_GOODS_TABLE = `
CREATE TABLE IF NOT EXISTS opendata_goods (
  id TEXT PRIMARY KEY,
  category TEXT CHECK(category IN (
    'book', 'article', 'video', 'audio', 'course', 'movie',
    'post', 'tweet', 'thread', 'note', 'comment',
    'shelf', 'playlist', 'folder', 'tag', 'inbox', 'kanban'
  )),
  title TEXT NOT NULL,
  summary TEXT,
  is_container BOOLEAN DEFAULT FALSE,
  owner_id TEXT REFERENCES opendata_agents(id),
  produced_by TEXT REFERENCES opendata_agents(id),
  co_producers JSON DEFAULT '[]',
  fingerprints JSON DEFAULT '{}',
  use_value JSON DEFAULT '{}',
  exchange_value JSON DEFAULT '{}',
  production_data JSON DEFAULT '{}',
  container_rules JSON,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived', 'deleted')),
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  published_at INTEGER,
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_goods_category ON opendata_goods(category);
CREATE INDEX IF NOT EXISTS idx_goods_producer ON opendata_goods(produced_by);
CREATE INDEX IF NOT EXISTS idx_goods_owner ON opendata_goods(owner_id);
CREATE INDEX IF NOT EXISTS idx_goods_status ON opendata_goods(status);
CREATE INDEX IF NOT EXISTS idx_goods_container ON opendata_goods(is_container);
`

/**
 * Create relations table (production relations)
 */
export const CREATE_RELATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS opendata_relations (
  id TEXT PRIMARY KEY,
  type TEXT CHECK(type IN (
    'PRODUCES', 'CONSUMES', 'OWNS', 'FOLLOWS', 'CONTAINS', 'REFERENCES'
  )),
  subject_type TEXT CHECK(subject_type IN ('agent', 'good')),
  subject_id TEXT NOT NULL,
  object_type TEXT CHECK(object_type IN ('agent', 'good')),
  object_id TEXT NOT NULL,
  context JSON DEFAULT '{}',
  source TEXT,
  source_id TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  UNIQUE(type, subject_id, object_id)
);

CREATE INDEX IF NOT EXISTS idx_relations_type ON opendata_relations(type);
CREATE INDEX IF NOT EXISTS idx_relations_subject ON opendata_relations(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_relations_object ON opendata_relations(object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_relations_source ON opendata_relations(source);
CREATE INDEX IF NOT EXISTS idx_relations_consumes ON opendata_relations(type, subject_id) WHERE type = 'CONSUMES';
CREATE INDEX IF NOT EXISTS idx_relations_owns ON opendata_relations(type, subject_id) WHERE type = 'OWNS';
CREATE INDEX IF NOT EXISTS idx_relations_follows ON opendata_relations(type, subject_id) WHERE type = 'FOLLOWS';
`

/**
 * Create sync_states table (sync states)
 */
export const CREATE_SYNC_STATES_TABLE = `
CREATE TABLE IF NOT EXISTS opendata_sync_states (
  source TEXT PRIMARY KEY,
  adapter_id TEXT,
  cursor TEXT,
  checkpoint JSON DEFAULT '{}',
  last_sync_at INTEGER,
  next_sync_at INTEGER,
  sync_count INTEGER DEFAULT 0,
  last_changes JSON DEFAULT '{}',
  config JSON DEFAULT '{}'
);
`

/**
 * Create sync_logs table (sync logs)
 */
export const CREATE_SYNC_LOGS_TABLE = `
CREATE TABLE IF NOT EXISTS opendata_sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  outcome TEXT CHECK(outcome IN ('success', 'partial', 'failure')),
  changes JSON DEFAULT '{}',
  error TEXT,
  checksum TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_source ON opendata_sync_logs(source);
CREATE INDEX IF NOT EXISTS idx_sync_logs_time ON opendata_sync_logs(completed_at);
`

/**
 * Initialize data: Create consumer (myself)
 */
export const INIT_CONSUMER_AGENT = `
INSERT OR IGNORE INTO opendata_agents (id, role, is_consumer, name, fingerprints)
VALUES ('me', 'consumer', TRUE, 'Me', '{}');
`

/**
 * Create default containers
 */
export const INIT_DEFAULT_CONTAINERS = `
INSERT OR IGNORE INTO opendata_goods (id, category, title, is_container, owner_id, status)
VALUES 
  ('inbox-default', 'inbox', 'Inbox', TRUE, 'me', 'active'),
  ('shelf-default', 'shelf', 'Default Bookshelf', TRUE, 'me', 'active'),
  ('folder-favorites', 'folder', 'Favorites', TRUE, 'me', 'active');
`

/**
 * All schema creation statements
 */
export const ALL_SCHEMAS = [
  CREATE_AGENTS_TABLE,
  CREATE_GOODS_TABLE,
  CREATE_RELATIONS_TABLE,
  CREATE_SYNC_STATES_TABLE,
  CREATE_SYNC_LOGS_TABLE,
]

/**
 * All initialization data
 */
export const ALL_INIT_DATA = [INIT_CONSUMER_AGENT, INIT_DEFAULT_CONTAINERS]
