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

### Available Colors

The following color names can be used in the `color` property:

| Color Name | Light Mode | Dark Mode |
| :--------- | :--------- | :-------- |
| `default`  | `#cccccc`  | `#333333` |
| `gray`     | `#eeeeee`  | `#555555` |
| `brown`    | `#e6c9a8`  | `#5b4d3d` |
| `pink`     | `#ffd3e6`  | `#9a3f5e` |
| `red`      | `#ffadad`  | `#a63232` |
| `orange`   | `#ffd6a5`  | `#ff9f4d` |
| `yellow`   | `#fdffb6`  | `#6e6620` |
| `green`    | `#caffbf`  | `#23563b` |
| `cyan`     | `#9bf6ff`  | `#1c5858` |
| `blue`     | `#a0c4ff`  | `#3168a8` |
| `purple`   | `#bdb2ff`  | `#6e33b4` |

---

## Formula

Used to perform calculations based on other fields in the record. The result can be displayed using different visual formats.

**Property Settings:**
| Property | Type | Description |
| :--- | :--- | :--- |
| `formula` | `string` | The formula expression. |
| `displayType` | `string` | How to render the result: `text`, `number`, `select`, `multi-select`, `url`, `file`. |
| `numberConfig` | `object` | Configuration when `displayType` is `number`. See [Number Config](#number-config). |
| `optionConfig` | `object` | Configuration when `displayType` is `select` or `multi-select`. See [Option Config](#option-config). |

### Number Config

Used when `displayType` is `number`.

| Property     | Type      | Description                                                         |
| :----------- | :-------- | :------------------------------------------------------------------ |
| `showAs`     | `string`  | Visual style: `"number"` or `"bar"`.                                |
| `color`      | `string`  | Tag color for bar style. See [Available Colors](#available-colors). |
| `divideBy`   | `number`  | The maximum value (denominator) for bar style.                      |
| `showNumber` | `boolean` | Whether to display the value next to the bar.                       |

### Option Config

Used when `displayType` is `select` or `multi-select`.

| Property   | Type    | Description                                                       |
| :--------- | :------ | :---------------------------------------------------------------- |
| `colorMap` | `array` | List of value-to-color mappings to override auto-assigned colors. |

**Color Map Item:**
| Property | Type | Description |
| :--- | :--- | :--- |
| `value` | `string` | The option value to customize. |
| `color` | `string` | The color to use. See [Available Colors](#available-colors). |

**Color Assignment:**

- Colors are automatically assigned based on a hash of the value (consistent for same values)
- Manual mappings in `colorMap` take precedence over auto-assigned colors
- For `multi-select`, values are split by comma (e.g., `"tag1,tag2,tag3"`)

---

## Link

Used to create relationships between records in different tables.

**Property Settings:**
| Property | Type | Description |
| :--- | :--- | :--- |
| `linkTableName` | `string` | Name of the table to link to. |
| `linkColumnName` | `string` | Name of the field in the target table for the reverse link. |
