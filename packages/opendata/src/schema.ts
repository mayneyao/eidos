/**
 * OpenData Database Schema
 */

export const SCHEMA_VERSION = 1

export const CREATE_TABLES_SQL = `
-- 0. raw_data table - Store raw API responses
CREATE TABLE IF NOT EXISTS opendata_raw_data (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  data TEXT NOT NULL,
  checksum TEXT,
  fetched_at INTEGER DEFAULT (strftime('%s', 'now')),
  transformed_at INTEGER,
  transform_version INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_raw_data_source ON opendata_raw_data(source);
CREATE INDEX IF NOT EXISTS idx_raw_data_entity ON opendata_raw_data(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_raw_data_fetched ON opendata_raw_data(fetched_at);
CREATE INDEX IF NOT EXISTS idx_raw_data_transformed ON opendata_raw_data(transformed_at) WHERE transformed_at IS NULL;

-- 1. agents table
CREATE TABLE IF NOT EXISTS opendata_agents (
  id TEXT PRIMARY KEY,
  role TEXT CHECK(role IN ('consumer', 'producer', 'platform')),
  is_consumer BOOLEAN DEFAULT FALSE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  fingerprints TEXT DEFAULT '{}',
  description TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_agents_consumer ON opendata_agents(is_consumer);
CREATE INDEX IF NOT EXISTS idx_agents_role ON opendata_agents(role);

-- 2. goods table
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
  co_producers TEXT DEFAULT '[]',
  fingerprints TEXT DEFAULT '{}',
  use_value TEXT DEFAULT '{}',
  exchange_value TEXT DEFAULT '{}',
  production_data TEXT DEFAULT '{}',
  container_rules TEXT,
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

-- 3. relations table
CREATE TABLE IF NOT EXISTS opendata_relations (
  id TEXT PRIMARY KEY,
  type TEXT CHECK(type IN ('PRODUCES', 'CONSUMES', 'OWNS', 'FOLLOWS', 'CONTAINS', 'REFERENCES')),
  subject_type TEXT CHECK(subject_type IN ('agent', 'good')),
  subject_id TEXT NOT NULL,
  object_type TEXT CHECK(object_type IN ('agent', 'good')),
  object_id TEXT NOT NULL,
  context TEXT DEFAULT '{}',
  source TEXT,
  source_id TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  UNIQUE(type, subject_id, object_id)
);

CREATE INDEX IF NOT EXISTS idx_relations_type ON opendata_relations(type);
CREATE INDEX IF NOT EXISTS idx_relations_subject ON opendata_relations(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_relations_object ON opendata_relations(object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_relations_consumes ON opendata_relations(type, subject_id) WHERE type = 'CONSUMES';
CREATE INDEX IF NOT EXISTS idx_relations_owns ON opendata_relations(type, subject_id) WHERE type = 'OWNS';
CREATE INDEX IF NOT EXISTS idx_relations_follows ON opendata_relations(type, subject_id) WHERE type = 'FOLLOWS';

-- 4. sync_states table
CREATE TABLE IF NOT EXISTS opendata_sync_states (
  source TEXT PRIMARY KEY,
  adapter_id TEXT,
  cursor TEXT,
  checkpoint TEXT DEFAULT '{}',
  last_sync_at INTEGER,
  next_sync_at INTEGER,
  sync_count INTEGER DEFAULT 0,
  last_changes TEXT DEFAULT '{}',
  config TEXT DEFAULT '{}'
);

-- 5. sync_logs table
CREATE TABLE IF NOT EXISTS opendata_sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  outcome TEXT CHECK(outcome IN ('success', 'partial', 'failure')),
  changes TEXT DEFAULT '{}',
  error TEXT,
  checksum TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_source ON opendata_sync_logs(source);
CREATE INDEX IF NOT EXISTS idx_sync_logs_time ON opendata_sync_logs(completed_at);
`

export const INIT_DATA_SQL = `
INSERT OR IGNORE INTO opendata_agents (id, role, is_consumer, name, fingerprints)
VALUES ('me', 'consumer', TRUE, 'Me', '{}');

INSERT OR IGNORE INTO opendata_goods (id, category, title, is_container, owner_id, status)
VALUES 
  ('inbox-default', 'inbox', 'Inbox', TRUE, 'me', 'active'),
  ('shelf-default', 'shelf', 'Default Bookshelf', TRUE, 'me', 'active'),
  ('folder-favorites', 'folder', 'Favorites', TRUE, 'me', 'active');
`
