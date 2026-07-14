---
title: 视图对象 (View Objects)
description: Eidos 视图类型与配置详细参考
---

视图定义了如何对表格数据进行可视化呈现和组织。每个视图都有唯一的标识符和决定其布局的特定类型。

## 支持的视图类型

| 类型      | 描述                         |
| :-------- | :--------------------------- |
| `grid`    | 标准的类电子表格表格视图。   |
| `kanban`  | 用于跟踪项目进度的看板视图。 |
| `gallery` | 基于卡片形式的视觉画廊视图。 |

## 通用视图属性

所有视图类型在 `IView` 对象中都共享以下核心属性：

| 属性            | 类型       | 描述                                                        |
| :-------------- | :--------- | :---------------------------------------------------------- |
| `id`            | `string`   | 唯一标识符（不带连字符的 UUIDv7）。                         |
| `name`          | `string`   | 视图的展示名称。                                            |
| `type`          | `string`   | [视图类型](#支持的视图类型) 标识符。                        |
| `query`         | `string`   | 定义此视图数据子集的 SQL 查询。                             |
| `fieldIds`      | `string[]` | 要显示的字段 ID 的有序列表（对应数据库中的 `columnName`）。 |
| `hidden_fields` | `string[]` | 要隐藏的字段 ID 列表（对应数据库中的 `columnName`）。       |
| `filter`        | `object`   | 结构化的过滤器配置。                                        |
| `order_map`     | `object`   | 排序配置（字段 ID/columnName 到排序顺序的映射）。           |
| `properties`    | `object`   | 特定类型的详细配置（见下文）。                              |

---

## 表格视图属性 (Grid)

`grid` 类型的特定设置：

| 属性            | 类型                               | 描述                                              |
| :-------------- | :--------------------------------- | :------------------------------------------------ |
| `fieldWidthMap` | `Record<string, number>`           | 字段 ID (`columnName`) 到其列宽（像素级）的映射。 |
| `freezeColumns` | `number`                           | 从左侧开始冻结的列数。                            |
| `columnStats`   | `Record<string, ColumnStatConfig>` | 列统计配置（见下文）。                            |

### 列统计配置

`columnStats` 属性允许你在每列底部显示汇总统计信息。每个键是字段 ID (`columnName`)，值是一个 `ColumnStatConfig` 对象：

| 属性        | 类型             | 描述                            |
| :---------- | :--------------- | :------------------------------ |
| `type`      | `ColumnStatType` | 要显示的统计类型。              |
| `precision` | `number`         | 数值结果的小数位数（默认：2）。 |

#### 支持的统计类型

| 类型               | 描述                               | 适用字段类型                   |
| :----------------- | :--------------------------------- | :----------------------------- |
| `countAll`         | 统计所有行                         | 除 `checkbox` 外的所有类型     |
| `countValues`      | 统计值（多值字段统计数组元素个数） | 除 `checkbox` 外的所有类型     |
| `countUnique`      | 统计唯一值                         | 除 `checkbox` 外的所有类型     |
| `countEmpty`       | 统计空值                           | 除 `checkbox` 外的所有类型     |
| `countNotEmpty`    | 统计非空值                         | 除 `checkbox` 外的所有类型     |
| `checked`          | 统计勾选（true）值                 | `checkbox`                     |
| `unchecked`        | 统计未勾选（false）值              | `checkbox`                     |
| `percentEmpty`     | 空值百分比                         | 除 `checkbox` 外的所有类型     |
| `percentNotEmpty`  | 非空值百分比                       | 除 `checkbox` 外的所有类型     |
| `percentChecked`   | 勾选百分比                         | `checkbox`                     |
| `percentUnchecked` | 未勾选百分比                       | `checkbox`                     |
| `sum`              | 数值求和                           | `number`, `rating`             |
| `avg`              | 平均值                             | `number`, `rating`, `checkbox` |
| `min`              | 最小值                             | `number`, `rating`, `date`     |
| `max`              | 最大值                             | `number`, `rating`, `date`     |
| `median`           | 中位数                             | `number`, `rating`             |
| `stdDev`           | 标准差                             | `number`, `rating`             |
| `range`            | 日期范围（天数）                   | `date`                         |

#### 示例

```json
{
  "columnStats": {
    "price": { "type": "sum", "precision": 2 },
    "quantity": { "type": "avg" },
    "completed": { "type": "percentChecked" }
  }
}
```

---

## 画廊视图属性 (Gallery)

`gallery` 类型的特定设置：

| 属性              | 类型             | 描述                                                                  |
| :---------------- | :--------------- | :-------------------------------------------------------------------- |
| `hideEmptyFields` | `boolean`        | 如果为 true，卡片上将不显示没有值的字段。                             |
| `coverPreview`    | `string \| null` | 用作卡片封面的字段 ID (`columnName`)，或使用 `"content"`, `"cover"`。 |
| `fitContent`      | `boolean`        | 如果为 true，封面图像将按比例缩放以适应卡片容器。                     |

---

## 看板视图属性 (Kanban)

`kanban` 类型的特定设置：

| 属性           | 类型     | 描述                                             |
| :------------- | :------- | :----------------------------------------------- |
| `groupByField` | `string` | 用于将卡片分组到不同列的字段 ID (`columnName`)。 |
| `cardSize`     | `string` | 卡片尺寸：`"small"`, `"medium"` 或 `"large"`。   |
