---
title: Field Objects
description: Detailed reference for Eidos Field types and configuration properties
---

Each field in an Eidos table consists of a `name`, a unique `columnName`, a `type`, and an optional `property` object that defines type-specific behavior.

## Supported Field Types

| Type               | Description                                       | Property                                 |
| :----------------- | :------------------------------------------------ | :--------------------------------------- |
| `title`            | The primary display name for the record.          | -                                        |
| `text`             | Multi-line text with optional AI embeddings.      | [Text Property](#text)                   |
| `number`           | Numeric values with formatting and visualizers.   | [Number Property](#number)               |
| `select`           | Single-choice selection from a list of options.   | [Select Property](#select--multi-select) |
| `multi-select`     | Multiple-choice selection from a list of options. | [Select Property](#select--multi-select) |
| `date`             | Date and time picker.                             | -                                        |
| `checkbox`         | Boolean (true/false) toggle.                      | -                                        |
| `url`              | Formatted web URL.                                | -                                        |
| `file`             | File uploads and attachments.                     | [File Property](#file)                   |
| `rating`           | Visual star rating.                               | -                                        |
| `formula`          | Read-only calculated field.                       | [Formula Property](#formula)             |
| `link`             | Relationship to another table.                    | [Link Property](#link)                   |
| `created-by`       | User who created the record.                      | -                                        |
| `last-edited-by`   | User who last modified the record.                | -                                        |
| `created-time`     | Automatic record creation timestamp.              | -                                        |
| `last-edited-time` | Automatic record last update timestamp.           | -                                        |

---

## Text

Used for long-form content. Supports AI-powered semantic search.

**Property Settings:**
| Property | Type | Description |
| :--- | :--- | :--- |
| `enableEmbedding` | `boolean` | If true, generates vector embeddings for semantic search. |
| `enableColorHint` | `boolean` | If true, shows visual indicator of vector sync status. |

---

## Number

Used for integers, decimals, percentages, and currency.

**Property Settings:**
| Property | Type | Description |
| :--- | :--- | :--- |
| `format` | `string` | Display format: `"number"`, `"percent"`, `"currency"`. |
| `showAs` | `string` | Visual style: `"number"`, `"bar"`, `"ring"`. |
| `divideBy` | `number` | The maximum value (denominator) for bar/ring styles. |
| `color` | `string` | Hex color (e.g., `#ffadad`) for bar/ring displays. |
| `showNumber` | `boolean` | Whether to display the value next to the bar/ring. |

---

## File

Used for storing references to local files, remote URLs, or data URIs. Multiple files can be stored as a comma-separated string.

**Storage Format:**
A string containing path(s) or URL(s), separated by commas. Eidos uses "smart splitting" to ensure that commas within a single filename or data URI are preserved.

**Supported Formats:**

- **Local Paths**: Paths within the Eidos workspace starting with `/files/` (e.g., `/files/019c47e80f477b41a5e954bca31cdfa8.jpeg`). These are workspace-relative, not physical system paths.
- **Web URLs**: Remote resources starting with `http://` or `https://`.
- **Data URIs**: Inline data starting with `data:` (e.g., `data:image/png;base64,...`).

**Property Settings:**
| Property | Type | Description |
| :--- | :--- | :--- |
| `proxyUrl` | `string` | The base URL used to proxy remote images to avoid CORS issues. |

---

## Select & Multi-select

Used for categorizing records using tags.

**Property Settings:**
| Property | Type | Description |
| :--- | :--- | :--- |
| `options` | `array` | List of [Option Objects](#option-object). |

**Option Object:**
| Property | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique identifier (value stored in DB). **Tip: Keep this same as `name`.** |
| `name` | `string` | Display name shown in UI. |
| `color` | `string` | Tag color. See [Available Colors](#available-colors). |

**Available Colors:**
`default`, `gray`, `brown`, `pink`, `red`, `orange`, `yellow`, `green`, `cyan`, `blue`, `purple`

---

## Formula

Used to perform calculations based on other fields in the record.

**Property Settings:**
| Property | Type | Description |
| :--- | :--- | :--- |
| `formula` | `string` | The formula expression. |
| `displayType` | `string` | The [FieldType](#supported-field-types) used to render the result. |

---

## Link

Used to create relationships between records in different tables.

**Property Settings:**
| Property | Type | Description |
| :--- | :--- | :--- |
| `linkTableName` | `string` | Name of the table to link to. |
| `linkColumnName` | `string` | Name of the field in the target table for the reverse link. |
