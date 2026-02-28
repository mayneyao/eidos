---
title: 字段对象 (Field Objects)
description: Eidos 字段类型与配置属性详细参考
---

Eidos 表格中的每个字段都由 `name` (名称)、唯一的 `columnName` (列名)、`type` (类型) 以及可选的 `property` (属性) 对象组成。

## 支持的字段类型

| 类型               | 描述                             | 属性 (Property)                              |
| :----------------- | :------------------------------- | :------------------------------------------- |
| `title`            | 记录的主要展示名称。             | -                                            |
| `text`             | 支持 AI 嵌入的多行文本。         | [文本属性](#文本-text)                       |
| `number`           | 支持多种格式与可视化样式的数值。 | [数值属性](#数值-number)                     |
| `select`           | 从预定义列表中进行单选。         | [选择属性](#选择与多选-select--multi-select) |
| `multi-select`     | 从预定义列表中进行多选。         | [选择属性](#选择与多选-select--multi-select) |
| `date`             | 日期与时间选择器。               | -                                            |
| `checkbox`         | 布尔值 (true/false) 切换。       | -                                            |
| `url`              | 格式化的网页链接。               | -                                            |
| `file`             | 文件上传与附件管理。             | [文件属性](#文件-file)                       |
| `rating`           | 视觉化的星级评分。               | -                                            |
| `formula`          | 只读的计算字段。                 | [计算属性](#计算字段-formula)                |
| `link`             | 与其他表格的关联关系。           | [关联属性](#表格关联-link)                   |
| `created-by`       | 记录的创建者。                   | -                                            |
| `last-edited-by`   | 记录的最后修改者。               | -                                            |
| `created-time`     | 记录创建时自动生成的时间戳。     | -                                            |
| `last-edited-time` | 记录最后修改时自动生成的时间戳。 | -                                            |

---

## 文本 (Text)

用于长文本内容。支持基于 AI 的语义搜索。

**Property 设置:**
| 属性 | 类型 | 描述 |
| :--- | :--- | :--- |
| `enableEmbedding` | `boolean` | 设为 true 时，将生成用于语义搜索的向量嵌入。 |
| `enableColorHint` | `boolean` | 设为 true 时，显示向量同步状态的视觉提示。 |

---

## 数值 (Number)

用于整数、小数、百分比和货币。

**Property 设置:**
| 属性 | 类型 | 描述 |
| :--- | :--- | :--- |
| `format` | `string` | 显示格式：`"number"` (数字), `"percent"` (百分比), `"currency"` (货币)。 |
| `showAs` | `string` | 视觉样式：`"number"` (数字), `"bar"` (进度条), `"ring"` (圆环)。 |
| `divideBy` | `number` | 用于进度条或圆环显示的分母（最大值）。 |
| `color` | `string` | 进度条或圆环的十六进制颜色（如 `#ffadad`）。 |
| `showNumber` | `boolean` | 是否在可视化图表旁显示数字。 |

---

## 文件 (File)

用于存储本地文件引用、远程 URL 或 Data URI。多个文件可以存储为逗号分隔的字符串。

**存储格式:**
包含路径或 URL 的字符串，以逗号分隔。Eidos 使用“智能切割”逻辑，确保单个文件名或 Data URI 内部的逗号不会被错误处理。

**支持的格式:**

- **本地路径**: Eidos 工作空间内的路径，以 `/files/` 开头（例如 `/files/019c47e80f477b41a5e954bca31cdfa8.jpeg`）。这些是工作空间相对路径，而非真实的物理磁盘路径。
- **网页链接**: 以 `http://` 或 `https://` 开头的远程资源。
- **Data URIs**: 以 `data:` 开头的内联数据（例如 `data:image/png;base64,...`）。

**Property 设置:**
| 属性 | 类型 | 描述 |
| :--- | :--- | :--- |
| `proxyUrl` | `string` | 用于代理远程图像的基础 URL，以解决跨域 (CORS) 问题。 |

---

## 选择与多选 (Select & Multi-select)

用于通过标签对记录进行分类。

**Property 设置:**
| 属性 | 类型 | 描述 |
| :--- | :--- | :--- |
| `options` | `array` | [选项对象 (Option Object)](#选项对象-option-object) 列表。 |

**选项对象 (Option Object):**
| 属性 | 类型 | 描述 |
| :--- | :--- | :--- |
| `id` | `string` | 唯一标识符（数据库中存储的值）。**提示：建议与 `name` 保持一致。** |
| `name` | `string` | UI 中显示的名称。 |
| `color` | `string` | 标签颜色。参见 [可用颜色](#可用颜色)。 |

**可用颜色:**
`default`, `gray`, `brown`, `pink`, `red`, `orange`, `yellow`, `green`, `cyan`, `blue`, `purple`

---

## 计算字段 (Formula)

用于根据记录中的其他字段执行逻辑计算。

**Property 设置:**
| 属性 | 类型 | 描述 |
| :--- | :--- | :--- |
| `formula` | `string` | 表达式内容。 |
| `displayType` | `string` | 用于渲染计算结果的 [字段类型](#支持的字段类型)。 |

---

## 表格关联 (Link)

用于在不同表格的记录之间建立关联。

**Property 设置:**
| 属性 | 类型 | 描述 |
| :--- | :--- | :--- |
| `linkTableName` | `string` | 要关联的目标表名称。 |
| `linkColumnName` | `string` | 在目标表中用于反向关联的字段名称。 |
