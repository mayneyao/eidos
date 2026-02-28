---
title: Managing Extensions
description: How to create, read, and manage Eidos extensions via API.
sidebar:
  order: 4
---

In Eidos, all extensions are managed as virtual files within the `~/.eidos/__EXTENSIONS__/` directory. This powerful architecture means you can completely rely on the standard **File System API (`eidos.space.fs`)** to dynamically create, update, retrieve, and delete extensions programmatically.

Eidos continuously monitors this virtual directory. Whenever you write or modify files here via the API, the system automatically compiles the code, performs a hot-reload, and registers the extension.

## Creating an Extension

To create an extension programmatically, use `writeFile` to write your React/TypeScript code logic directly into the `__EXTENSIONS__` virtual directory.

```typescript
// Dynamically create an extension named "my-extension.tsx"
const code = `
import { useEidos } from "@eidos.space/react";

export const meta = {
  type: "extNode",
  componentName: "MyCustomNode",
  extNode: { 
    title: "Dynamic Node", 
    description: "Created dynamically via API", 
    type: "custom-node" 
  }
};

export default function MyCustomNode() {
  return <div>Hello, I am a dynamic extension injected via API!</div>;
}
`;

await eidos.space.fs.writeFile(
  "~/.eidos/__EXTENSIONS__/my-extension.tsx",
  code
);
```
Once the file is written, Eidos instantly makes the extension available.

## Listing Extensions

You can retrieve a list of all currently installed extensions in your Space using `readdir`.

```typescript
// Get a list of all extension file names
const extensions = await eidos.space.fs.readdir("~/.eidos/__EXTENSIONS__/");
console.log(extensions); 
// Output example: ["my-extension.tsx", "plugin-folder/my-table-view.tsx"]
```

## Updating an Extension

To update an extension and trigger a hot-reload, simply overwrite the original file with your updated code.

```typescript
const updatedCode = `...`;
await eidos.space.fs.writeFile(
  "~/.eidos/__EXTENSIONS__/my-extension.tsx",
  updatedCode
);
```

## Renaming an Extension

You can alter the name or reorganise the internal path structure of an extension using the `rename` API.

```typescript
await eidos.space.fs.rename(
  "~/.eidos/__EXTENSIONS__/my-extension.tsx",
  "~/.eidos/__EXTENSIONS__/new-name.tsx"
);
```

## Deleting (Uninstalling) an Extension

If you need to remove an extension, simply use the `rm` command on its virtual path.

```typescript
// Delete the extension
await eidos.space.fs.rm("~/.eidos/__EXTENSIONS__/my-extension.tsx");
```

## Best Practices & File Structure

1. **Subdirectories**: For a large extension composed of multiple files, you can create a folder structure inside the extensions directory (e.g., `~/.eidos/__EXTENSIONS__/my-plugin/index.tsx` alongside `~/.eidos/__EXTENSIONS__/my-plugin/utils/helper.ts`).
2. **File Extensions**: Use the `.tsx` suffix for UI-inclusive extensions (like `extNode`, `tableView`, `fileHandler`), and use `.ts` for script extensions containing purely logical processes (such as `tableAction`, `tool`, `udf`).
