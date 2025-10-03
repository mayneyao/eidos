export const getTemplates = (space: string) => [
  {
    name: "queryAllFiles",
    i18nKey: "dataview.template.queryAllFiles",
    descriptionKey: "dataview.template.queryAllFiles.description",
    tags: ["file"],
    category: "file",
    difficulty: "beginner",
    sql: `
-- [path_display:file]
SELECT
    *,
    CASE
        WHEN path LIKE 'spaces/%' THEN substr(path, 7)
        ELSE path
    END AS path_display
FROM eidos__files
    `
  },
  {
    name: "queryAllImages",
    i18nKey: "dataview.template.queryAllImages",
    descriptionKey: "dataview.template.queryAllImages.description",
    tags: ["file", "image"],
    category: "file",
    difficulty: "beginner",
    sql: `
-- [path_display:file]
SELECT 
    id,
    CASE
        WHEN path LIKE 'spaces/%' THEN substr(path, 7)
        ELSE path
    END AS path_display,
    *
FROM eidos__files WHERE mime LIKE 'image/%'
    `
  },
  {
    name: "queryAllBookmarksInDocs",
    i18nKey: "dataview.template.queryAllBookmarksInDocs",
    descriptionKey: "dataview.template.queryAllBookmarksInDocs.description",
    tags: ["doc", "bookmark"],
    category: "doc",
    difficulty: "intermediate",
    sql: `
-- [url:url]
-- [image:file]
-- [fetched:checkbox]
-- [pathname:url]
WITH valid_docs AS (
    SELECT id, content, created_at
    FROM eidos__docs
    WHERE json_valid(content) = 1
)
SELECT
    json_extract(j.value, '$.title') as title,
    json_extract(j.value, '$.description') as description,
    json_extract(j.value, '$.fetched') as fetched,
    '/${space}/' || d.id AS pathname,
    d.created_at as created_at,
    json_extract(j.value, '$.url') as url,
    json_extract(j.value, '$.image') as image,
    d.id as doc_id,
    json_extract(j.value, '$.type') as type
FROM valid_docs d,
    json_tree(d.content, '$.root.children') AS j
WHERE j.type = 'object'
AND json_extract(j.value, '$.type') = 'bookmark';
`
  }, {
    name: "queryAllChecklistsInDocs",
    i18nKey: "dataview.template.queryAllChecklistsInDocs",
    descriptionKey: "dataview.template.queryAllChecklistsInDocs.description",
    tags: ["doc", "checklist"],
    category: "doc",
    difficulty: "intermediate",
    sql: `
-- [checked:checkbox]
-- [pathname:url]
WITH
  valid_docs AS (
    SELECT
      id,
      content,
      created_at
    FROM
      eidos__docs
    WHERE
      json_valid(content) = 1
  )
SELECT
  json_extract(j.value, '$.children[0].text') as text,
  json_extract(j.value, '$.checked') as checked,
  '/${space}/' || d.id AS pathname,
  d.created_at as created_at,
  d.id as doc_id
FROM
  valid_docs d,
  json_tree(d.content, '$.root.children') AS parent,
  json_tree(parent.value, '$.children') AS j
WHERE
  parent.type = 'object'
  AND json_extract(parent.value, '$.type') = 'list'
  AND json_extract(parent.value, '$.listType') = 'check'
  AND j.type = 'object'
  AND json_extract(j.value, '$.type') = 'listitem'
  AND json_extract(j.value, '$.children[0].text') IS NOT NULL
  AND trim(json_extract(j.value, '$.children[0].text')) != ''
        `
  },
  {
    name: "queryRecentChecklistsInDocs",
    i18nKey: "dataview.template.queryRecentChecklistsInDocs",
    descriptionKey: "dataview.template.queryRecentChecklistsInDocs.description",
    tags: ["doc", "checklist", "recent"],
    category: "doc",
    difficulty: "intermediate",
    sql: `
-- [checked:checkbox]
-- [pathname:url]
WITH
  valid_docs AS (
    SELECT
      id,
      content,
      created_at,
      updated_at
    FROM
      eidos__docs
    WHERE
      json_valid(content) = 1
      AND created_at >= datetime('now', '-7 days')
  )
SELECT
  json_extract(j.value, '$.children[0].text') as text,
  json_extract(j.value, '$.checked') as checked,
  '/${space}/' || d.id AS pathname,
  d.created_at as created_at,
  d.updated_at as updated_at,
  d.id as doc_id
FROM
  valid_docs d,
  json_tree(d.content, '$.root.children') AS parent,
  json_tree(parent.value, '$.children') AS j
WHERE
  parent.type = 'object'
  AND json_extract(parent.value, '$.type') = 'list'
  AND json_extract(parent.value, '$.listType') = 'check'
  AND j.type = 'object'
  AND json_extract(j.value, '$.type') = 'listitem'
  AND json_extract(j.value, '$.children[0].text') IS NOT NULL
  AND trim(json_extract(j.value, '$.children[0].text')) != ''
ORDER BY
  d.created_at DESC
        `
  },
  {
    name: "queryAllMermaidDiagramsInDocs",
    i18nKey: "dataview.template.queryAllMermaidDiagramsInDocs",
    descriptionKey: "dataview.template.queryAllMermaidDiagramsInDocs.description",
    tags: ["doc", "mermaid"],
    category: "doc",
    difficulty: "intermediate",
    sql: `
-- [pathname:url]
WITH
  valid_docs AS (
    SELECT
      id,
      content
    FROM
      eidos__docs
    WHERE
      json_valid(content) = 1
  )
SELECT
  json_extract(j.value, '$.text') as text,
  '/${space}/' || d.id AS pathname,
  d.id as doc_id
FROM
  valid_docs d,
  json_tree(d.content, '$.root.children') AS j
WHERE
  j.type = 'object'
  AND json_extract(j.value, '$.type') = 'mermaid'
    `
  },
  {
    name: "queryAllUrlsInDocs",
    i18nKey: "dataview.template.queryAllUrlsInDocs",
    descriptionKey: "dataview.template.queryAllUrlsInDocs.description",
    tags: ["doc", "url", "link"],
    category: "doc",
    difficulty: "intermediate",
    sql: `
-- [url:url]
-- [pathname:url]
WITH
  valid_docs AS (
    SELECT
      id,
      content,
      created_at
    FROM
      eidos__docs
    WHERE
      json_valid(content) = 1
  ),
  autolink_urls AS (
    SELECT
      json_extract(j.value, '$.url') as url,
      json_extract(j.value, '$.text') as text,
      json_extract(j.value, '$.type') as type,
      d.id as doc_id,
      d.created_at as created_at
    FROM
      valid_docs d,
      json_tree(d.content, '$.root.children') AS j
    WHERE
      j.type = 'object'
      AND json_extract(j.value, '$.type') IN ('autolink', 'link')
      AND json_extract(j.value, '$.url') IS NOT NULL
  ),
  bookmark_urls AS (
    SELECT
      json_extract(j.value, '$.url') as url,
      json_extract(j.value, '$.title') as text,
      'bookmark' as type,
      d.id as doc_id,
      d.created_at as created_at
    FROM
      valid_docs d,
      json_tree(d.content, '$.root.children') AS j
    WHERE
      j.type = 'object'
      AND json_extract(j.value, '$.type') = 'bookmark'
      AND json_extract(j.value, '$.url') IS NOT NULL
  )
SELECT
  text,
  url,
  type,
  '/${space}/' || doc_id AS pathname,
  created_at,
  doc_id
FROM (
  SELECT * FROM autolink_urls
  UNION ALL
  SELECT * FROM bookmark_urls
)
ORDER BY created_at DESC
    `
  },
  {
    name: "queryEidosTables",
    i18nKey: "dataview.template.queryEidosTables",
    descriptionKey: "dataview.template.queryEidosTables.description",
    tags: ["system", "eidos", "table"],
    category: "system",
    difficulty: "beginner",
    sql: `
SELECT
    *
FROM
    sqlite_master
WHERE
    type = 'table'
    AND name LIKE 'eidos__%'
    `
  },
  {
    name: "queryAllTriggers",
    i18nKey: "dataview.template.queryAllTriggers",
    descriptionKey: "dataview.template.queryAllTriggers.description",
    tags: ["system", "trigger", "sqlite"],
    category: "system",
    difficulty: "beginner",
    sql: `
SELECT
    name,
    tbl_name,
    sql,
    type
FROM
    sqlite_master
WHERE
    type = 'trigger'
ORDER BY
    name
    `
  },
  {
    name: "queryAllIndexes",
    i18nKey: "dataview.template.queryAllIndexes",
    descriptionKey: "dataview.template.queryAllIndexes.description",
    tags: ["system", "index", "sqlite"],
    category: "system",
    difficulty: "beginner",
    sql: `
SELECT
    name,
    tbl_name,
    sql,
    type
FROM
    sqlite_master
WHERE
    type = 'index'
    AND name NOT LIKE 'sqlite_%'
ORDER BY
    tbl_name, name
    `
  },
  {
    name: "queryAllViews",
    i18nKey: "dataview.template.queryAllViews",
    descriptionKey: "dataview.template.queryAllViews.description",
    tags: ["system", "view", "sqlite"],
    category: "system",
    difficulty: "beginner",
    sql: `
SELECT
    name,
    sql,
    type
FROM
    sqlite_master
WHERE
    type = 'view'
ORDER BY
    name
    `
  },
  {
    name: "queryTableSchema",
    i18nKey: "dataview.template.queryTableSchema",
    descriptionKey: "dataview.template.queryTableSchema.description",
    tags: ["system", "schema", "table"],
    category: "system",
    difficulty: "intermediate",
    sql: `
SELECT
    name,
    sql,
    type
FROM
    sqlite_master
WHERE
    type = 'table'
    AND name NOT LIKE 'sqlite_%'
    AND name NOT LIKE 'fts_%'
ORDER BY
    name
    `
  },
  {
    name: "queryDatabaseStats",
    i18nKey: "dataview.template.queryDatabaseStats",
    descriptionKey: "dataview.template.queryDatabaseStats.description",
    tags: ["system", "stats", "database"],
    category: "system",
    difficulty: "intermediate",
    sql: `
-- [count:number]
SELECT
    type,
    COUNT(*) as count,
    GROUP_CONCAT(name, ', ') as names
FROM
    sqlite_master
WHERE
    name NOT LIKE 'sqlite_%'
    AND name NOT LIKE 'fts_%'
GROUP BY
    type
ORDER BY
    type
    `
  },
  {
    name: "queryAllDocs",
    i18nKey: "dataview.template.queryAllDocs",
    descriptionKey: "dataview.template.queryAllDocs.description",
    tags: ["doc", "all"],
    category: "doc",
    difficulty: "beginner",
    sql: `
SELECT
  t.name as title,
  '/${space}/' || t.id AS pathname, -- [pathname:url]
  d.*
FROM
  eidos__tree t
  JOIN eidos__docs d ON t.id = d.id
ORDER BY
  d.created_at DESC
    `
  },
  {
    name: "queryAllUserTables",
    i18nKey: "dataview.template.queryAllUserTables",
    descriptionKey: "dataview.template.queryAllUserTables.description",
    tags: ["table", "user", "custom"],
    category: "table",
    difficulty: "intermediate",
    sql: `
-- [pathname:url]
SELECT
  t.name as title,
  '/${space}/' || t.id AS pathname
FROM
  eidos__tree t
  JOIN sqlite_master sm ON sm.name = 'tb_' || t.id
WHERE
  t.type = 'table'
  AND sm.type = 'table' AND t.is_deleted = 0
ORDER BY
  t.created_at DESC
    `
  }
]
