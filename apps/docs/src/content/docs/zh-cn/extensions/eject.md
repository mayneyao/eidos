---
title: Eject（导出）
description: 导出内置扩展以进行自定义。
sidebar:
  order: 4
  badge: New
---

**Eject** 允许你将内置扩展（如 Journal、Monaco Editor）导出到用户空间，以便编辑和自定义。

## 工作原理

内置扩展直接在应用中运行以获得最佳性能。导出后：

1. 提取 TypeScript 源代码
2. 编译为 JavaScript
3. 保存为带有 `ejected/` 前缀的常规用户扩展

## 示例：自定义 Journal

假设你想自定义内置的 **Journal** 扩展：

1. 进入 **设置** → **扩展**
2. 找到 **Journal** 并点击 **Eject**
3. 现在你会在扩展列表中看到 `ejected/journal/index`
4. 点击预览 — 它就像原版 Journal 一样工作
5. 编辑代码进行自定义（更改样式、添加功能等）
6. **固定到侧边栏** — 将导出的 Journal 添加到左侧边栏标签页作为快速入口
7. 你的自定义 Journal 现在会与默认版本一起出现在侧边栏中

:::note
两个版本共存。默认 Journal 会保留，除非你到 设置 → 扩展 中禁用它。
:::

## 多文件扩展

某些扩展（如 Journal）包含多个文件。每个文件成为一个单独的扩展：

- `ejected/journal/index` — 主组件
- `ejected/journal/use-journals` — 依赖
- `ejected/journal/utils` — 工具函数

## 重要说明

|            | 内置扩展 | 导出扩展               |
| ---------- | -------- | ---------------------- |
| **可编辑** | ❌ 否    | ✅ 是                  |
| **性能**   | 原生     | 轻微沙箱开销           |
| **更新**   | 自动     | 手动（重新导出以更新） |
| **运行在** | 主应用   | iframe 沙箱            |

:::caution
导出后，扩展不会自动接收更新。要获取更新，请删除后重新导出。
:::

## 使用场景

- **自定义** — 修改样式、为 Journal 添加功能
- **学习** — 研究 Monaco Editor 的工作原理
- **Fork** — 构建你自己的 Media Preview 版本

## 故障排除

**"Already Ejected" 错误** — 先删除现有的导出扩展。

**哪个版本会被使用？** — 两个扩展都可用。对于某些扩展类型（如文件处理器），你可能会看到两个选项。如果只希望使用自定义版本，请禁用内置扩展。

**查看源代码** — 你可以在 [github.com/mayneyao/eidos/tree/dev/extensions](https://github.com/mayneyao/eidos/tree/dev/extensions) 浏览所有内置扩展的源代码
