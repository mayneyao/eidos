# Eidos - Personal Data Management Framework

## Project Overview

Eidos is an extensible framework for personal data management - an offline-first, AI-powered alternative to Notion. It transforms SQLite into a personal pocket database that everyone can use, with both web and desktop applications.

The project is licensed under AGPL v3, with specific packages (`@eidos.space/core`, `@eidos.space/react`) released under MIT to facilitate integration and ecosystem growth.

## Technology Stack

### Core Technologies

- **Frontend**: React 18 + TypeScript 5.8+ + Vite 6+
- **UI Framework**: Tailwind CSS 3.4+ with Radix UI primitives and Shadcn UI components
- **Rich Text Editor**: Lexical 0.34+ (Facebook's extensible text editor framework)
- **State Management**: Zustand for global state, SWR for data fetching
- **Database**: SQLite with dual implementation:
  - Web: `@sqlite.org/sqlite-wasm` for browser compatibility
  - Desktop: `@eidos.space/better-sqlite3` for native performance
- **Desktop Framework**: Electron 32+ with native file system access
- **AI Integration**: Multiple LLM providers via `ai` package (OpenAI, Anthropic, Google, Mistral, Cohere, Groq, and more)

### Build & Development Tools

- **Package Manager**: pnpm 10+ with workspaces
- **Build Tool**: Vite with custom configurations
- **Linting**: Oxlint (Rust-based linter) with TypeScript and React plugins
- **Testing**: Vitest with jsdom environment
- **Formatting**: Prettier with import sorting via `@ianvs/prettier-plugin-sort-imports`
- **Type Checking**: TypeScript 5.8+ with strict mode

## Project Structure

```
eidos/
├── apps/
│   ├── web-app/          # Main React web application with PWA support
│   ├── desktop/          # Electron wrapper for desktop (package name: "eidos")
│   ├── docs/             # Documentation site (Astro + Starlight)
│   ├── cli/              # CLI tool for space management (@eidos.space/cli)
│   ├── headless/         # Headless server with Graft sync support
│   ├── download/         # Cloudflare worker for download page
│   └── capture/          # Screen capture utility
├── packages/
│   ├── core/             # Business logic, SQLite operations (@eidos.space/core)
│   ├── ai/               # AI integration layer with multi-provider support
│   ├── react/            # React hooks and context for extensions (@eidos.space/react)
│   ├── lib/              # Shared utilities, storage, and embedding
│   ├── shared/           # TypeScript types and shared Vite configuration
│   ├── worker/           # Web workers for background processing
│   ├── locales/          # Internationalization resources
│   ├── space-manager/    # Space and database management (@eidos.space/space-manager)
│   ├── code-editor/      # Monaco-based code editor
│   ├── sandbox/          # Extension sandboxing system (@eidos.space/sandbox)
│   ├── sync/             # Data synchronization
│   ├── v3/               # V3 compiler for extensions (@eidos.space/v3)
│   ├── client/           # Client-side utilities (@eidos.space/client)
│   └── ext-server/       # Extension server (@eidos.space/ext-server)
├── extensions/           # Built-in extensions
│   ├── blocks/           # Block extensions (UI components)
│   │   ├── graft/        # Graft sync block
│   │   ├── journal/      # Journal/day planner
│   │   ├── media-preview/# Media file preview
│   │   └── monaco-editor/# Code editor block
│   └── scripts/          # Script extensions (data logic)
├── scripts/              # Build and utility scripts
└── static/               # Static assets
```

## Key Configuration Files

- **package.json**: Main project configuration with workspace setup
- **pnpm-workspace.yaml**: Workspace package management including extensions
- **tsconfig.json**: TypeScript with path mapping for monorepo structure
- **apps/web-app/vite.config.ts**: Vite PWA configuration
- **apps/web-app/tailwind.config.mjs**: Comprehensive Tailwind setup with custom theme
- **apps/desktop/electron/electron-builder.json**: Desktop app packaging configuration
- **.oxlintrc.json**: Linting rules with TypeScript and React support
- **vitest.config.ts**: Testing configuration with environment switching
- **prettier.config.cjs**: Code formatting with import sorting

## Path Mapping (TypeScript)

```json
{
  "@eidos.space/core": "./packages/core/index.ts",
  "@eidos.space/react": "./packages/react/src/index.ts",
  "@/locales/*": "./packages/locales/*",
  "@/worker/*": "./packages/worker/*",
  "@/lib/*": "./packages/lib/*",
  "@/components/*": "./apps/web-app/components/*",
  "@/hooks/*": "./apps/web-app/hooks/*",
  "@/styles/*": "./apps/web-app/styles/*",
  "@/*": "./*"
}
```

## Development Commands

### Web Development

```bash
pnpm dev              # Start web app development server
pnpm build            # Build web app for production
pnpm preview          # Preview production build
```

### Desktop Development

```bash
# First-time setup
cd apps/desktop && node scripts/download-libsimple.cjs

# Development
pnpm dev:desktop      # Start desktop app in development mode
pnpm build:desktop    # Build desktop app
pnpm pkg:desktop      # Package desktop app for distribution
pnpm pkg:desktop:dev  # Package desktop app (dev mode)
```

### CLI Development

```bash
cd apps/cli
bun run dev           # Run CLI in development
bun run build         # Build CLI binary
```

### Documentation

```bash
pnpm dev:docs         # Start docs development server
pnpm build:docs       # Build documentation
pnpm deploy:docs      # Deploy documentation
```

### Code Quality

```bash
pnpm lint             # Run oxlint on entire codebase
pnpm lint:fix         # Auto-fix linting issues
pnpm typecheck        # TypeScript type checking across all packages
pnpm typecheck:tsgo   # Type checking with tsgo
pnpm format:write     # Format code with Prettier
pnpm format:check     # Check code formatting
```

### Testing

```bash
pnpm test             # Run Vitest tests
```

### Version Management

```bash
pnpm patch            # Increment patch version
pnpm minor            # Increment minor version
pnpm major            # Increment major version
```

### SQLite Extensions

```bash
pnpm install:sqlite-ext # Install required SQLite extensions
```

## Architecture Highlights

### Extension System

Eidos has a powerful extension architecture with two main types:

- **Blocks**: UI components for custom data display and interaction
  - TableView: Custom table visualization (e.g., timeline, chart)
  - ExtNode: Custom node types (e.g., Excalidraw, diagrams)
  - FileHandler: Custom file type handlers (e.g., markdown editor)

- **Scripts**: TypeScript/JavaScript/Python processing logic
  - TableAction: Actions on table rows
  - DocAction: Actions on documents
  - Tool: AI-callable tools
  - UDF: User-defined SQL functions

Extensions are stored in the database and can be created manually or generated by AI. They use hooks from `@eidos.space/react` to interact with the Eidos API.

### Data Architecture

- **Offline-first**: Everything runs locally with SQLite
- **Real-time pipeline**: Change triggers and full-text/semantic search
- **File integration**: Both browser APIs and native file system access (desktop)
- **Undo/redo**: Comprehensive data operation tracking
- **Meta-tables**: Custom schema for managing tables, views, and extensions

### AI Integration

- **Multi-provider support**: Unified interface for 15+ LLM providers via `@ai-sdk/*`
- **Context-aware functions**: AI can access and manipulate data
- **Extension generation**: AI can create custom blocks and scripts
- **Embedding search**: Semantic search capabilities with vector embeddings

### Security Considerations

- Extension sandboxing prevents unauthorized access to system resources
- AI-generated code is executed in isolated environments using V3 compiler
- Database operations are validated before execution
- File system access is controlled through designated APIs

## Code Style Guidelines

### TypeScript

- Use TypeScript for all new code, avoid `any` types
- Strict mode enabled with comprehensive type checking
- Path mapping for clean imports across monorepo

### Styling

- Tailwind CSS for all styling with mobile-first approach
- CSS variables for theming (HSL color format)
- Custom design system based on Shadcn UI
- Animations defined in Tailwind config (accordion, shimmer, etc.)

### React Components

- Keep components small and focused
- Use functional components with hooks
- Zustand for global state, React hooks for local state
- UI components from Radix UI primitives

### Imports

Imports are sorted using Prettier plugin in this order:

1. React and Next.js imports
2. Third-party modules
3. Type definitions
4. Configuration imports
5. Library utilities (`@/lib/*`)
6. Hooks (`@/hooks/*`)
7. UI components (`@/components/ui/*`)
8. Other components (`@/components/*`)
9. Styles (`@/styles/*`)
10. Relative imports

## Testing Strategy

- **Framework**: Vitest with jsdom environment for UI tests
- **Environment switching**: Node environment for `lib/v3/*.test.ts`
- **Globals**: Enabled for test functions
- **Location**: Test files co-located with source files when possible

## Build Considerations

- **Memory allocation**: Increased to 8GB (`NODE_OPTIONS=--max-old-space-size=8192`) for complex builds
- **Desktop builds**: Require native dependency management (better-sqlite3, bindings)
- **Web builds**: Optimized for PWA deployment with service worker
- **Extensions**: Compiled and sandboxed using V3 compiler for security
- **COOP/COEP headers**: Required for SharedArrayBuffer support (WASM)

## Workspace Dependencies

The project uses pnpm workspace references (e.g., `"@eidos.space/core": "workspace:*"`). Always run `pnpm install` at the root level to properly link all packages.

Published packages:

- `@eidos.space/core` - Core data management (MIT)
- `@eidos.space/react` - React hooks for extensions (MIT)
- `@eidos.space/sandbox` - Script sandbox (ISC)
- `@eidos.space/v3` - Code compiler (ISC)
- `@eidos.space/space-manager` - Space management (ISC)

## Common Development Tasks

### Adding a New Package

1. Create package directory in `packages/`
2. Add `package.json` with workspace dependencies
3. Update path mapping in root `tsconfig.json` if needed
4. Add TypeScript configuration with proper path mapping

### Working with Extensions

1. Extensions live in `extensions/blocks/` or `extensions/scripts/`
2. Each extension is a standalone workspace package
3. Use the sandbox system for secure execution
4. Follow the V3 compiler specifications
5. Test extensions in both web and desktop environments

### Database Operations

1. Use the core package for all SQLite operations
2. Implement proper error handling and validation
3. Consider offline-first architecture
4. Use the real-time pipeline for reactive updates

### Adding New AI Providers

1. Add the corresponding `@ai-sdk/*` package to `packages/ai/package.json`
2. Export the provider from the AI package
3. Update provider configuration in the web app

## Resources

- Website: https://eidos.space
- Documentation: https://docs.eidos.space
- Download: https://eidos.space/download
- Discord: https://discord.gg/cGQqjeFpZq
