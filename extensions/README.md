# Eidos Built-in Extensions

This directory contains official built-in extensions for Eidos.

## Structure

```
extensions/
├── blocks/          # Block extensions (UI components)
│   └── <extension>/
│       ├── package.json
│       └── index.tsx
└── scripts/         # Script extensions (data logic)
    └── <extension>/
        ├── package.json
        └── index.ts
```

## Block Extensions

Block extensions provide custom UI rendering. Types include:

- **TableView**: Custom table visualization (e.g., timeline, chart)
- **ExtNode**: Custom node types (e.g., Excalidraw, diagrams)
- **FileHandler**: Custom file type handlers (e.g., markdown editor)

## Script Extensions

Script extensions handle data logic. Types include:

- **TableAction**: Actions on table rows
- **DocAction**: Actions on documents
- **Tool**: AI-callable tools
- **UDF**: User-defined SQL functions

## Development

Each extension is a standalone workspace package:

```bash
# Install dependencies
pnpm install

# Build all extensions
pnpm -r --filter "./extensions/**" build
```

## Using @eidos.space/react

Extensions use hooks from `@eidos.space/react`:

```tsx
import { useEidos } from "@eidos.space/react"

export function MyExtension() {
  const eidos = useEidos()
  // Use eidos.currentSpace.* APIs
}
```
