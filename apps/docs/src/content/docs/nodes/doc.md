---
title: Documents
description: Where your thoughts live
sidebar:
  order: 1
---

Documents are the heart of Eidos. They're where you think, write, and capture ideas. But unlike a typical word processor, these documents are designed to play well with the rest of your data.

Think of them as smart text containers that know they're part of a larger system.

## How we store your words

Every document in Eidos lives in a table called `eidos__docs`. This might seem odd if you're used to thinking of documents as files, but there's a good reason for it.

When your documents are in a database, they become queryable. You can search across all your writing instantly. You can link between documents. You can even write scripts that analyze your writing patterns or extract information from your notes.

Here's what the storage looks like under the hood:

```sql
CREATE TABLE IF NOT EXISTS eidos__docs (
    id TEXT PRIMARY KEY,
    content TEXT,
    markdown TEXT,
    is_day_page BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## What each field means

| Field       | Type      | What it's for                                                         |
| ----------- | --------- | --------------------------------------------------------------------- |
| id          | TEXT      | Each document's unique fingerprint                                    |
| content     | TEXT      | The rich content in Lexical format (what the editor uses)             |
| markdown    | TEXT      | A markdown version for export and interoperability                    |
| is_day_page | boolean   | Whether this is a daily journal page                                  |
| created_at  | timestamp | When you first started this document                                  |
| updated_at  | timestamp | When you last touched it                                              |
| meta        | TEXT      | JSON format display configuration (controls which properties to show) |

The clever bit is storing content in two formats. The `content` field holds the rich, structured format that makes editing smooth. The `markdown` field gives you portability—you can always export your thoughts in a format that will be readable decades from now.

### ID Generation

- When you create a new document, the id is generated using uuidv7 as a random string.
- When you use the journal module, the id is the current date, for example 2025-01-01.

This means that the `eidos__docs` table will have two types of ids, which you can distinguish using the `is_day_page` field.

- Random string, for example `0190b47cc6d0758baf066cd8aded669a`
- Date, for example `2025-01-01`

## Custom Properties

You can add custom properties to documents. These properties don't affect normal document usage but can be used to store additional information. It's similar to frontmatter, which commonly uses YAML format in the markdown header to store metadata.

Suppose you have a markdown document like this:

```markdown
---
my_custom_property: value1
my_custom_property_2: value2
---

this is a markdown document
```

Then its actual storage in the `eidos__docs` table would be:

| id  | content           | is_day_page | markdown                    | created_at          | updated_at          | my_custom_property | my_custom_property_2 |
| --- | ----------------- | ----------- | --------------------------- | ------------------- | ------------------- | ------------------ | -------------------- |
| 1   | <lexical_content> | 0           | this is a markdown document | 2025-01-01 12:00:00 | 2025-01-01 12:00:00 | value1             | value2               |

### Reserved Properties

The system's default fields (as shown in the table above) are reserved properties. You cannot use these field names when creating custom properties. Here are the fields that serve as reserved properties:

Existing properties:

- id
- content
- markdown
- is_day_page
- created_at
- updated_at

Future reserved properties:

- properties
- meta

Also avoid using fields that start with `_`. In general convention, fields starting with `_` are system-reserved fields.

### Working with Dataview

As you can see, `eidos__docs` doesn't store document titles. Document titles are in the `eidos__tree` table. However, the `eidos__tree` table is linked to the `eidos__docs` table through the `id` field. Therefore, you can use JOIN queries in dataview to get document titles and use custom properties to filter documents.

```sql
SELECT
  t.name as title,
  d.*
FROM
  eidos__tree t
  JOIN eidos__docs d ON t.id = d.id
WHERE
  d.my_custom_property = 'value1'
  AND d.my_custom_property_2 = 'value2';
```

## Documents in Tables

Every row record in a table can be expanded into a document. The document content is still from the `eidos__docs` table, but it will include the table's metadata.
This document's `id` in the `eidos__docs` table, the `id` in the `eidos__tree` table, and the `_id` in the `tb_<node_id>` table are the same.

- `id` in `eidos__docs` table, for example `0190b47cc6d0758baf066cd8aded669a`
- `id` in `eidos__tree` table, for example `0190b47cc6d0758baf066cd8aded669a`
- `_id` in `tb_<node_id>` table, for example `0190b47c-c6d0-758b-af06-6cd8aded669a`

These sub-documents in tables will have two types of properties:

- Properties from the table's fields
- Global properties from the `eidos__docs` table
