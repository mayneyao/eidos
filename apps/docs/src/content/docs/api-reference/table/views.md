---
title: View Objects
description: Detailed reference for Eidos View types and configuration
---

Views define how table data is visualized and organized. Each view has a unique identifier and a specific type that determines its layout.

## Supported View Types

| Type | Description |
| :--- | :--- |
| `grid` | Standard spreadsheet-like table view. |
| `kanban` | Board view for tracking items through stages. |
| `gallery` | Card-based visual gallery view. |

## Common View Properties

All view types share these core properties in the `IView` object:

| Property | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique identifier (UUIDv7 without dashes). |
| `name` | `string` | Display name of the view. |
| `type` | `string` | [View type](#supported-view-types) identifier. |
| `query` | `string` | The SQL query defining the data subset for this view. |
| `fieldIds` | `string[]` | Ordered list of field IDs (equivalent to `columnName` in the database). |
| `hidden_fields` | `string[]` | List of field IDs (equivalent to `columnName` in the database) to be hidden. |
| `filter` | `object` | Structured filter configuration. |
| `order_map` | `object` | Sorting configuration (mapping field IDs/columnNames to order). |
| `properties` | `object` | Type-specific configuration (see below). |

---

## Grid View Properties

Specific settings for the `grid` type:

| Property | Type | Description |
| :--- | :--- | :--- |
| `fieldWidthMap` | `Record<string, number>` | Mapping of field IDs (`columnName`) to their column widths in pixels. |
| `freezeColumns` | `number` | Number of columns to freeze from the left side. |

---

## Gallery View Properties

Specific settings for the `gallery` type:

| Property | Type | Description |
| :--- | :--- | :--- |
| `hideEmptyFields` | `boolean` | If true, fields with no value won't be displayed on the card. |
| `coverPreview` | `string \| null` | Field ID (`columnName`) to use for the card cover, or `"content"`, `"cover"`. |
| `fitContent` | `boolean` | If true, the cover image will be scaled to fit within the card. |

---

## Kanban View Properties

Specific settings for the `kanban` type:

| Property | Type | Description |
| :--- | :--- | :--- |
| `groupByField` | `string` | The ID of the field (`columnName`) used to group cards into columns. |
| `cardSize` | `string` | Size of the cards: `"small"`, `"medium"`, or `"large"`. |
