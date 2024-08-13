Now we organize all new blocks in the `components/doc/blocks/` directory. Each block has its own dedicated folder, following a consistent file structure. Here's an overview of the typical layout:

```
blocks/
  mermaid/
    component.tsx
    node.tsx
    plugin.ts
```

## Core concepts

The Doc Editor is built on top of `Lexical`, so some concepts are the same, but with different names.

https://lexical.dev/docs/getting-started/creating-plugin

### Component

how block is rendered

### Node

how block is structured

https://lexical.dev/docs/concepts/nodes

### Plugin

how block is registered
