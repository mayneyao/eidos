# @eidos.space/space-manager

Space management utilities for Eidos - handles space registration, initialization, and configuration.

## Usage

```typescript
import { SpaceInitializer, getSpaceRegistry } from "@eidos.space/space-manager"

// Get space registry singleton
const registry = getSpaceRegistry()

// List all spaces
const spaces = registry.getAllSpaces()

// Get a specific space
const space = registry.getSpace("space-id")

// Initialize a new space
const initializer = new SpaceInitializer()
await initializer.initializeSpace("/path/to/space", {
  name: "My Space",
  extensions: {
    simple: { libPath: "/path/to/libsimple.dylib" },
    vec: { libPath: "/path/to/libvec.dylib" },
  },
})
```

## API

### SpaceRegistry

- `getAllSpaces(): SpaceInfo[]` - Get all registered spaces
- `getSpace(id: string): SpaceInfo | null` - Get a specific space by ID
- `getFirstSpace(): SpaceInfo | null` - Get the first available space
- `addSpace(info: SpaceInfo): void` - Register a new space
- `removeSpace(id: string): void` - Unregister a space
- `validateSpace(id: string): boolean` - Check if a space exists and is valid

### SpaceInitializer

- `initializeSpace(path: string, options: SpaceInitOptions): Promise<void>` - Initialize a new Eidos space with database and meta tables

## File Structure

```
packages/space-manager/
├── src/
│   ├── index.ts              # Main exports
│   ├── types.ts              # TypeScript interfaces
│   ├── space-registry.ts     # Space registration logic
│   └── space-initializer.ts  # Space initialization logic
├── dist/                     # Compiled output (gitignored, for production)
├── package.json              # With conditional exports
└── tsconfig.json             # TypeScript config
```

## Development

```bash
# No build needed for development!
# Just edit files in src/ and they'll be used directly

# Type checking (optional, IDE does this automatically)
npm run typecheck

# Build for production (only when needed)
npm run build
```

## Troubleshooting

### Changes not reflected?

If you're seeing stale code:

1. **Desktop App**: Restart the Vite dev server
2. **CLI**: Run `bun run dev` again
3. **Check conditions**: Verify `NODE_ENV` is not set to `production`

### TypeScript errors?

Make sure your IDE is using the workspace TypeScript version:

- VS Code: CMD+Shift+P → "TypeScript: Select TypeScript Version" → "Use Workspace Version"

### Need to test production build?

```bash
# Build the package
cd packages/space-manager
npm run build

# Temporarily edit consuming package's imports to force use dist
# Or set NODE_ENV=production when running
```

## Integration

This package is consumed by:

- `apps/cli` - CLI commands for space management
- `apps/desktop` - Desktop app Electron main process
- Future: Web app space management UI

All consumers benefit from zero-build development workflow!
