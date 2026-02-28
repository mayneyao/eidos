---
title: 管理扩展 (Extension Management)
description: 如何通过 API 创建、查看和管理 Eidos 扩展。
sidebar:
  order: 4
---

在 Eidos 中，所有的扩展（Extensions）都作为虚拟文件存放在 `~/.eidos/__EXTENSIONS__/` 目录下。这意味着你可以完全使用 Eidos 的**标准文件系统 API (`eidos.space.fs`)** 来动态地创建、更新、查看和删除扩展。

Eidos 后台会实时监听这个虚拟目录。当你通过 API 写入或修改这些文件时，系统会自动完成编译、热更新并将其挂载生效。

## 创建扩展

要通过 API 创建一个扩展，只需使用 `writeFile` 将扩展的 React / TypeScript 代码写入到 `__EXTENSIONS__` 目录中。

```typescript
// 动态创建一个名为 "my-extension.tsx" 的扩展
const code = `
import { useEidos } from "@eidos.space/react";

export const meta = {
  type: "extNode",
  componentName: "MyCustomNode",
  extNode: { 
    title: "动态节点", 
    description: "通过 API 动态创建", 
    type: "custom-node" 
  }
};

export default function MyCustomNode() {
  return <div>你好，我是通过 API 注入的动态扩展！</div>;
}
`;

await eidos.space.fs.writeFile(
  "~/.eidos/__EXTENSIONS__/my-extension.tsx",
  code
);
```
写入完成后，Eidos 就会立刻让这个扩展生效。

## 查看所有扩展

你可以通过 `readdir` 读取虚拟扩展目录，获取当前 Space 中安装的所有扩展。

```typescript
// 获取所有的扩展文件名列表
const extensions = await eidos.space.fs.readdir("~/.eidos/__EXTENSIONS__/");
console.log(extensions); 
// 输出示例: ["my-extension.tsx", "plugin-folder/my-table-view.tsx"]
```

## 更新扩展

扩展的热更新只需覆盖原文件即可。如果是复杂的扩展结构，可以直接写入新的 `.tsx` 内容。

```typescript
const updatedCode = `...`;
await eidos.space.fs.writeFile(
  "~/.eidos/__EXTENSIONS__/my-extension.tsx",
  updatedCode
);
```

## 重命名扩展

你可以通过 `rename` API 修改扩展的文件名或改变它的路径层级。

```typescript
await eidos.space.fs.rename(
  "~/.eidos/__EXTENSIONS__/my-extension.tsx",
  "~/.eidos/__EXTENSIONS__/new-name.tsx"
);
```

## 删除（卸载）扩展

如果要移除某个扩展，使用 `rm` 从虚拟目录中删除对应的文件即可。

```typescript
// 删除扩展
await eidos.space.fs.rm("~/.eidos/__EXTENSIONS__/my-extension.tsx");
```

## 目录与项目结构

1. **子目录支持**：对于带有多个组件的大型扩展，你可以建立自己的文件夹结构，例如写入 `~/.eidos/__EXTENSIONS__/my-plugin/index.tsx` 和 `~/.eidos/__EXTENSIONS__/my-plugin/components/Button.tsx`。
2. **后缀规范**：包含 React 编写的 UI 扩展（如 `extNode`, `tableView`, `fileHandler`）请使用 `.tsx`，纯逻辑处理配置的（如 `tableAction`, `tool`, `udf` 等 Script 扩展）使用 `.ts` 即可。
