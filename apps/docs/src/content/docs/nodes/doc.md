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
    meta TEXT DEFAULT '{}', -- JSON string for display configuration
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
| meta        | TEXT      | JSON format display configuration (controls which properties to show) |
| created_at  | timestamp | When you first started this document                                  |
| updated_at  | timestamp | When you last touched it                                              |

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

### Property Types

Document custom property types are not as rich as table properties, providing only basic types:

- Text
- Number
- Checkbox (boolean)
- Date
- DateTime
- Multi-select (array of text)

### Reserved Properties

The system's default fields (as shown in the table above) are reserved properties. You cannot use these field names when creating custom properties. Here are the fields that serve as reserved properties:

Existing properties:

- id
- content
- markdown
- is_day_page
- created_at
- updated_at
- meta

Future reserved properties:

- properties
- slug
- filename

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

## Custom Actions

In addition to custom properties, you can also add custom actions to documents. These actions make your documents more intelligent and automated.

Imagine that after you finish writing an article, the system can automatically generate a summary for you; when you check off all your todos, the system can automatically calculate the completion rate; when you finish recording your daily meals, the system can automatically calculate your calorie intake.

These actions are implemented through the [script](/extensions/script) extension. You just need to create a script that exposes a `meta` object with `type` set to [docAction](/extensions/script#23-document-action-scripts), and the system will automatically recognize it and add it to the document actions menu.

### Use Case - Calculate Completion

Suppose you use a document to record today's todos, marking completion status with checkboxes. You want the system to automatically calculate the completion rate so you can see today's progress at a glance.

First, we need to create a number-type property called `completion`. Then, write a script to analyze the checkbox status in the document:

```ts
export const meta = {
  type: "docAction",
  funcName: "calculateCompletion",
  docAction: {
    name: "Calculate Completion",
    description: "Calculates the completion percentage of the document",
  },
}

export async function calculateCompletion(
  input: Record<string, any>,
  ctx: {
    docId: string
  }
) {
  const { docId } = ctx
  const doc = await eidos.currentSpace.doc.getMarkdown(docId)
  // Extract completion ratio from markdown checkboxes
  const uncheckedCount = doc
    .split("\n")
    .filter((line) => line.startsWith("- [ ]")).length
  const checkedCount = doc
    .split("\n")
    .filter((line) => line.startsWith("- [x]")).length
  const totalCount = uncheckedCount + checkedCount
  const completion = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0

  await eidos.currentSpace.doc.setProperties(docId, {
    completion,
  })
  return {
    completion,
  }
}
```

### Use Case - Calculate Calories

Now let's look at a more complex example. Suppose you're writing a fitness journal, recording your daily meals, and want the system to automatically calculate your calorie intake.

First, create a number-type property called `calories`. Then, we can leverage the power of AI to automatically analyze your meal records.

The Eidos SDK provides rich AI functionality. You can use `eidos.AI.generateText` to generate text content like summaries. For scenarios that require structured data like calculating calories, we use `eidos.AI.generateObject` to ensure the AI returns an object containing calorie information:

```ts
export const meta = {
  type: "docAction",
  funcName: "calculateCalories",
  docAction: {
    name: "Calculate Calories",
    description: "Calculates the calories of the document",
  },
}

export async function calculateCalories(
  input: Record<string, any>,
  ctx: {
    docId: string
  }
) {
  const { docId } = ctx
  const doc = await eidos.currentSpace.doc.getMarkdown(docId)
  const { calories } = await eidos.AI.generateObject({
    model: "google/gemini-2.5-flash-lite@openrouter",
    prompt: `Calculate the calories of the following document:
    ${doc}`,
    schema: {
      type: "object",
      properties: {
        calories: {
          type: "number",
        },
      },
      required: ["calories"],
    },
    }
  })
  await eidos.currentSpace.doc.setProperties(docId, {
    calories,
  })
  return {
    calories,
  }
}
```
