# @eidos.space/opendata

OpenData - A personal data management framework based on an economics perspective.

## Core Philosophy

The essence of personal data management is **ownership records of digital assets**. In the era before AI, users were locked in silos across various platforms, with data scattered and difficult to export. Now, through the Adapter protocol, users can regain control of their digital production materials and establish a unified personal data balance sheet.

---

## Table of Contents

1. [Foundation Concepts](#foundation-concepts)
2. [Data Model](#data-model)
3. [Behavior & Interactions](#behavior--interactions)
4. [Scenario Validation](#scenario-validation)
5. [Design Decisions](#design-decisions)
6. [Future Extensions](#future-extensions)

---

## Foundation Concepts

### 1.1 Economic Agents

All participants in economic activities, divided into three categories:

| Role         | Definition                              | Examples                     |
| ------------ | --------------------------------------- | ---------------------------- |
| **Consumer** | The owner of data - the user themselves | Me                           |
| **Producer** | Entities that create content            | Authors, YouTubers, Bloggers |
| **Platform** | Intermediaries providing marketplaces   | WeRead, YouTube, Douban      |

**Key Insights**:

- There is only one consumer (myself), the sovereign of data
- Producers are diverse, the sources of data
- Platforms are markets, Adapters are trade protocols

### 1.2 Goods

All objects that can be consumed, possessing **use value** and **exchange value**:

| Goods Type             | Use Value                                  | Exchange Value                          | Examples                     |
| ---------------------- | ------------------------------------------ | --------------------------------------- | ---------------------------- |
| **Knowledge Goods**    | Information acquisition, skill improvement | Platform points, paid prices            | Books, courses, videos       |
| **Relationship Goods** | Social satisfaction, information flow      | Likes, shares, influence                | Tweets, notes, comments      |
| **Container Goods**    | Organization capability, categorization    | Organization cost, retrieval efficiency | Bookshelves, playlists, tags |

**Dual Attributes of Goods**:

- **Use Value**: The content itself (text, images, audio)
- **Exchange Value**: Platform-assigned metadata (ratings, likes, comment counts)

### 1.3 Relations

Various economic behaviors connecting agents and goods:

| Relation Type | Definition          | Economics Meaning                              |
| ------------- | ------------------- | ---------------------------------------------- |
| **PRODUCES**  | Producer → Goods    | Labor creates value                            |
| **CONSUMES**  | Consumer → Goods    | Consumption of use value                       |
| **OWNS**      | Consumer → Goods    | Private property ownership                     |
| **FOLLOWS**   | Consumer → Producer | Futures contract (reserving future output)     |
| **CONTAINS**  | Container → Goods   | Capital accumulation (digital asset portfolio) |

---

## Data Model

### 2.1 Schema Design

```sql
-- ============================================
-- 1. Economic Agents Table (AGENTS)
-- ============================================
CREATE TABLE agents (
    id TEXT PRIMARY KEY,
    -- Role identifier
    role TEXT CHECK(role IN ('producer', 'consumer', 'platform')),

    -- Consumer unique identifier
    is_consumer BOOLEAN DEFAULT false,

    -- Agent information
    name TEXT NOT NULL,
    avatar_url TEXT,

    -- Cross-platform identity fingerprints (producers may exist on multiple platforms)
    fingerprints JSON,
    -- Example: {"weread": "author_id_123", "douban": "456", "isni": "0000-0001-..."}

    -- Metadata
    description TEXT,
    created_at INTEGER,
    updated_at INTEGER
);

-- Create consumer (myself)
-- INSERT INTO agents VALUES ('me', 'consumer', true, 'Me', null, {}, null, now, now);

-- ============================================
-- 2. Goods Table (GOODS)
-- ============================================
CREATE TABLE goods (
    id TEXT PRIMARY KEY,

    -- Goods classification
    category TEXT CHECK(category IN (
        -- Knowledge goods
        'book', 'article', 'video', 'audio', 'course', 'movie',
        -- Relationship goods
        'post', 'tweet', 'thread', 'note', 'comment',
        -- Container goods
        'shelf', 'playlist', 'folder', 'tag', 'inbox', 'kanban'
    )),

    -- Basic attributes
    title TEXT NOT NULL,
    summary TEXT,

    -- Value attributes
    use_value JSON,         -- Use value (content body)
    -- Example (book): {"isbn": "9787536692930", "pages": 302, "language": "zh"}
    -- Example (video): {"duration": 600, "resolution": "1080p", "transcript": "..."}

    exchange_value JSON,    -- Exchange value (platform metadata)
    -- Example: {"weread_rating": 4.5, "douban_rating": 8.9, "likes": 1000}

    -- Provenance: who produced it
    produced_by TEXT REFERENCES agents(id),

    -- Multi-producer support (co-authors, collaborative videos, etc.)
    co_producers JSON,      -- ["agent_id_1", "agent_id_2"]

    -- Production materials (raw data snapshots)
    production_data JSON,
    -- Example: {"weread": {"raw": {...}, "fetched_at": 1700000000}}

    -- Container attributes (if container-type goods)
    is_container BOOLEAN DEFAULT false,
    container_rules JSON,   -- Dynamic container rules (e.g., "unread articles" auto-collection)

    -- Status
    status TEXT CHECK(status IN ('active', 'archived', 'deleted')),

    -- Timestamps
    created_at INTEGER,     -- First discovered/imported time
    published_at INTEGER,   -- Original publication time
    updated_at INTEGER
);

-- ============================================
-- 3. Relations Table (RELATIONS)
-- ============================================
CREATE TABLE relations (
    id TEXT PRIMARY KEY,

    -- Relation type
    type TEXT CHECK(type IN (
        'PRODUCES',     -- Production relation
        'CONSUMES',     -- Consumption relation
        'OWNS',         -- Ownership relation
        'FOLLOWS',      -- Following relation
        'CONTAINS',     -- Containment relation (container-member)
        'REFERENCES'    -- Reference relation (between goods)
    )),

    -- Subject (active party)
    subject_type TEXT CHECK(subject_type IN ('agent', 'good')),
    subject_id TEXT NOT NULL,

    -- Object (passive party)
    object_type TEXT CHECK(object_type IN ('agent', 'good')),
    object_id TEXT NOT NULL,

    -- Relation attributes (context)
    context JSON,
    -- PRODUCES:  {"role": "author", "contribution": 0.8}
    -- CONSUMES:  {"status": "reading", "progress": 45, "started_at": ..., "rating": 5}
    -- OWNS:      {"acquired_at": ..., "price": 0, "currency": "CNY"}
    -- FOLLOWS:   {"priority": 100, "notify": true, "since": ...}
    -- CONTAINS:  {"position": 0, "added_at": ..., "note": "must read"}

    -- Data source
    source TEXT,            -- 'weread', 'youtube', 'manual', 'inferred'
    source_id TEXT,         -- Platform original relation ID

    -- Timestamps
    created_at INTEGER,
    updated_at INTEGER,

    -- Unique constraint: one record per relation
    UNIQUE(type, subject_id, object_id)
);

-- ============================================
-- 4. Sync States Table (SYNC_STATES)
-- ============================================
CREATE TABLE sync_states (
    source TEXT PRIMARY KEY,        -- 'weread.qq.com/shelf'
    adapter_id TEXT,                -- Adapter used

    -- Sync cursor
    cursor TEXT,                    -- Platform pagination cursor
    checkpoint JSON,                -- Incremental sync checkpoint

    -- Statistics
    last_sync_at INTEGER,
    next_sync_at INTEGER,           -- Next sync time
    sync_count INTEGER DEFAULT 0,

    -- Change records
    last_changes JSON,              -- {added: N, updated: N, removed: N}

    -- Configuration
    config JSON                     -- {interval: 3600, enabled: true}
);
```

### 2.2 Index Design

```sql
-- Agent queries
CREATE INDEX idx_agents_consumer ON agents(is_consumer);
CREATE INDEX idx_agents_fingerprints ON agents(fingerprints) WHERE fingerprints IS NOT NULL;

-- Goods queries
CREATE INDEX idx_goods_category ON goods(category);
CREATE INDEX idx_goods_producer ON goods(produced_by);
CREATE INDEX idx_goods_status ON goods(status);

-- Full-text search (using SQLite FTS5)
CREATE VIRTUAL TABLE goods_fts USING fts5(title, summary, content=goods);

-- Relation queries
CREATE INDEX idx_relations_type ON relations(type);
CREATE INDEX idx_relations_subject ON relations(subject_type, subject_id);
CREATE INDEX idx_relations_object ON relations(object_type, object_id);
CREATE INDEX idx_relations_source ON relations(source);

-- Composite indexes: common query optimization
CREATE INDEX idx_relations_consumes ON relations(type, subject_id) WHERE type = 'CONSUMES';
CREATE INDEX idx_relations_follows ON relations(type, subject_id) WHERE type = 'FOLLOWS';
```

---

## Behavior & Interactions

### 3.1 First-Login Sync Flow

Taking WeRead as an example:

```
┌─────────────────────────────────────────────────────────────────┐
│  Step 1: Adapter Execution                                      │
│  weread-shelf.adapter.yaml → PipelineRunner                     │
│  Fetch raw data: { books: [{bookId, title, author, ...}] }      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Step 2: Identify Producers (Authors)                           │
│  For each author:                                               │
│    1. Fingerprint match: SELECT id FROM agents WHERE fingerprints->>'weread' = authorId│
│    2. Exists → get agent_id                                     │
│    3. Not exists → INSERT INTO agents (role='producer', fingerprints={weread: authorId})│
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Step 3: Create Goods (Books)                                   │
│  For each book:                                                 │
│    INSERT INTO goods (                                          │
│      category='book',                                           │
│      title='The Three-Body Problem',                            │
│      produced_by='agent-liu-cixin',                             │
│      use_value={isbn: '978...', pages: 302},                   │
│      production_data={weread: {raw: {...}, fetched_at: now}}    │
│    )                                                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Step 4: Establish Relations                                    │
│  1. Ownership relation (OWNS): This book is on my shelf         │
│     INSERT INTO relations (type='OWNS', subject_id='me', object_id='book-xxx')│
│                                                                 │
│  2. Consumption relation (CONSUMES): My reading status          │
│     INSERT INTO relations (type='CONSUMES', subject_id='me', object_id='book-xxx',│
│       context={status: 'finished', rating: 5, read_at: ...})    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Step 5: Update Sync State                                      │
│  INSERT OR REPLACE INTO sync_states                             │
│    (source, cursor, last_sync_at, last_changes)                 │
│  VALUES                                                         │
│    ('weread.qq.com/shelf', 'next_cursor_xxx', now, {added: 10, updated: 2})│
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Incremental Sync Flow

```sql
-- 1. Get last sync state
SELECT cursor, last_sync_at FROM sync_states WHERE source = 'weread.qq.com/shelf';

-- 2. Adapter requests changes (with cursor)
-- GET https://weread.qq.com/...?syncKey={cursor}

-- 3. Process changes
-- For each changed book:
--   - Compute content fingerprint
--   - Compare checksum in production_data
--   - Decide: INSERT / UPDATE / DELETE

-- 4. Conflict resolution (same book from multiple platforms)
-- Strategy: Keep latest (updated_at) or merge (merge use_value)
```

### 3.3 Typical Query Operations

```sql
-- ============================================
-- Query 1: All my books (my bookshelf)
-- ============================================
SELECT g.*, r.context as my_reading_status
FROM relations r
JOIN goods g ON r.object_id = g.id
WHERE r.type = 'OWNS'
  AND r.subject_id = 'me'
  AND g.category = 'book';

-- ============================================
-- Query 2: Content creators I follow
-- ============================================
SELECT a.*, r.context as follow_settings
FROM relations r
JOIN agents a ON r.object_id = a.id
WHERE r.type = 'FOLLOWS'
  AND r.subject_id = 'me'
  AND a.role = 'producer';

-- ============================================
-- Query 3: All works by an author
-- ============================================
SELECT g.*
FROM goods g
WHERE g.produced_by = 'agent-liu-cixin'
   OR 'agent-liu-cixin' IN (SELECT value FROM json_each(g.co_producers));

-- ============================================
-- Query 4: My recent reading (timeline)
-- ============================================
SELECT g.title, g.category, r.context->>'read_at' as read_at
FROM relations r
JOIN goods g ON r.object_id = g.id
WHERE r.type = 'CONSUMES'
  AND r.subject_id = 'me'
  AND r.context->>'status' = 'finished'
ORDER BY r.context->>'read_at' DESC
LIMIT 20;

-- ============================================
-- Query 5: Same book across platforms (fingerprint match)
-- ============================================
SELECT g.*, g.exchange_value as ratings
FROM goods g
WHERE g.use_value->>'isbn' = '9787536692930';
-- Results include: WeRead version, Douban version, paperback version

-- ============================================
-- Query 6: My collections and their contents (nested containers)
-- ============================================
-- Get all collections
SELECT * FROM goods
WHERE is_container = true
  AND category IN ('shelf', 'folder', 'tag');

-- Get contents of a collection
SELECT g.*, r.context->>'position' as position
FROM relations r
JOIN goods g ON r.object_id = g.id
WHERE r.type = 'CONTAINS'
  AND r.subject_id = 'shelf-sci-fi-must-read'
ORDER BY r.context->>'position';

-- ============================================
-- Query 7: Recent output from people I follow (activity feed)
-- ============================================
WITH following AS (
  SELECT object_id as producer_id FROM relations
  WHERE type = 'FOLLOWS' AND subject_id = 'me'
)
SELECT g.*, a.name as producer_name
FROM goods g
JOIN agents a ON g.produced_by = a.id
WHERE g.produced_by IN (SELECT producer_id FROM following)
  AND g.created_at > strftime('%s', 'now', '-7 days')
ORDER BY g.published_at DESC;

-- ============================================
-- Query 8: Consumption statistics (yearly review)
-- ============================================
SELECT
  g.category,
  COUNT(*) as count,
  AVG(r.context->>'rating') as avg_rating
FROM relations r
JOIN goods g ON r.object_id = g.id
WHERE r.type = 'CONSUMES'
  AND r.subject_id = 'me'
  AND r.context->>'finished_at' LIKE '2024%'
GROUP BY g.category;
```

### 3.4 Write Operations

```sql
-- ============================================
-- Add a book to my bookshelf
-- ============================================
-- 1. Check if goods already exists (fingerprint match)
SELECT id FROM goods WHERE use_value->>'isbn' = '9787536692930';

-- 2. If not exists, create
INSERT INTO goods (id, category, title, use_value, produced_by, production_data)
VALUES ('book-uuid', 'book', 'The Three-Body Problem', '{"isbn": "..."}', 'agent-liu-cixin', '{"weread": {...}}');

-- 3. Establish ownership relation
INSERT INTO relations (type, subject_type, subject_id, object_type, object_id, source)
VALUES ('OWNS', 'agent', 'me', 'good', 'book-uuid', 'manual');

-- ============================================
-- Mark reading progress
-- ============================================
-- Update consumption relation (UPSERT)
INSERT INTO relations (type, subject_id, object_id, context)
VALUES ('CONSUMES', 'me', 'book-uuid', '{"status": "reading", "progress": 50, "updated_at": now}')
ON CONFLICT(type, subject_id, object_id)
DO UPDATE SET context = json_patch(context, excluded.context);

-- ============================================
-- Follow a creator
-- ============================================
-- 1. Check/Create producer
INSERT OR IGNORE INTO agents (id, role, name, fingerprints)
VALUES ('agent-new', 'producer', 'New Creator', '{"bilibili": "uid123"}');

-- 2. Establish follow relation
INSERT INTO relations (type, subject_id, object_id, context)
VALUES ('FOLLOWS', 'me', 'agent-new', '{"priority": 100, "since": now}');

-- ============================================
-- Create collection and add content
-- ============================================
-- 1. Create container
INSERT INTO goods (id, category, title, is_container, owner_id)
VALUES ('shelf-new', 'shelf', 'Sci-Fi Must Read', true, 'me');

-- 2. Add member
INSERT INTO relations (type, subject_id, object_id, context)
VALUES ('CONTAINS', 'shelf-new', 'book-uuid', '{"position": 0, "added_at": now}');
```

---

## Scenario Validation

### 4.1 WeRead Bookshelf

```yaml
Scenario: Sync WeRead bookshelf
Data Flow:
  - Adapter: weread-shelf
  - Input: WeRead login session
  - Output: Raw JSON

Database Changes:
  agents:
    - Identify or create book authors (producers)

  goods:
    - Insert books (category='book', produced_by=author_id)
    - use_value: { isbn, title, author, cover }
    - exchange_value: { weread_rating, read_count }
    - production_data: { weread: { raw: { ... }, syncKey: "xxx" } }

  relations:
    - OWNS: me → book (this book is on my shelf)
    - CONSUMES: me → book (context includes reading progress, notes)

  sync_states:
    - Record cursor for next incremental sync
```

### 4.2 YouTube Subscriptions

```yaml
Scenario: Sync YouTube subscription list
Data Flow:
  - Adapter: youtube-subscriptions

Database Changes:
  agents:
    - Insert channels (role='producer', fingerprints include channel_id)

  relations:
    - FOLLOWS: me → channel (follow relation)
    - context: { priority, notify, since }

  goods (optional, if pre-fetching videos):
    - Insert recent videos (category='video', produced_by=channel_id)
```

### 4.3 Twitter/X Bookmarks

```yaml
Scenario: Sync Twitter bookmarked tweets
Data Flow:
  - Adapter: twitter-likes

Database Changes:
  agents:
    - Identify tweet authors (producers)

  goods:
    - Insert tweets (category='tweet', produced_by=author_id)
    - use_value: { text, media_urls, created_at }
    - exchange_value: { likes, retweets }

  relations:
    - OWNS: me → tweet (I bookmarked it)
    - CONTAINS: folder-favorites → tweet (if categorized)
```

### 4.4 Same Book on Multiple Platforms

```yaml
Scenario: "The Three-Body Problem" exists on both WeRead and Douban
Processing:
  1. WeRead syncs first
     - goods: id='book-santi-weread', use_value->isbn='9787536692930'

  2. Douban syncs later
     - Check: SELECT id FROM goods WHERE use_value->>'isbn' = '9787536692930'
     - Conflict detected, strategy selection:

       Strategy A - Merge (Recommended):
         - UPDATE goods SET
           exchange_value = json_patch(exchange_value, '{"douban_rating": 8.9}'),
           production_data = json_patch(production_data, '{"douban": {...}}')
         - Keep single record, aggregate multi-platform metadata

       Strategy B - Independent:
         - INSERT new record id='book-santi-douban'
         - User manually marks "same book" (establish REFERENCES relation)
```

---
