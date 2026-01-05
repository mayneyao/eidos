-- Captures table for storing user messages and attachments
CREATE TABLE IF NOT EXISTS captures (
  id TEXT PRIMARY KEY,
  content TEXT,
  created_at INTEGER NOT NULL,
  type TEXT DEFAULT 'text', -- 'text', 'image', 'file', 'audio', 'video'
  metadata TEXT, -- JSON: { fileName, fileSize, mimeType, filePath, etc }
  synced INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_captures_created_at ON captures(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_captures_synced ON captures(synced);

-- Settings table for app configuration
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

