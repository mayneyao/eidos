# Eidos - Personal Data Management Framework

## Project Overview

Eidos is an extensible framework for personal data management - an offline-first, AI-powered alternative to Notion. It transforms SQLite into a personal pocket database that everyone can use, with both web and desktop applications.

## Technology Stack

### Core Technologies
- **Frontend**: React 18 + TypeScript + Vite
- **UI Framework**: Tailwind CSS with Radix UI and custom Shadcn UI components
- **Rich Text Editor**: Lexical (Facebook's extensible text editor framework)
- **State Management**: Zustand for global state, SWR for data fetching
- **Database**: SQLite with dual implementation:
  - Web: `@sqlite.org/sqlite-wasm` for browser compatibility
  - Desktop: `@eidos.space/better-sqlite3` for native performance
- **Desktop Framework**: Electron with native file system access
- **AI Integration**: Multiple LLM providers via `ai` package (OpenAI, Anthropic, Google, Mistral)

### Build & Development Tools
- **Package Manager**: pnpm with workspaces
- **Build Tool**: Vite with custom configurations
- **Linting**: Oxlint (Rust-based linter) with TypeScript and React plugins
- **Testing**: Vitest with jsdom environment
- **Formatting**: Prettier with import sorting
- **Type Checking**: TypeScript 5.8+ with strict mode

## Project Structure

```
eidos/
├── apps/
│   ├── web-app/          # Main React web application with PWA
│   ├── desktop/          # Electron wrapper for desktop
│   └── docs/             # Documentation site (Astro + Starlight)
├── packages/
│   ├── core/             # Business logic, SQLite operations
│   ├── ai/               # AI integration layer
│   ├── lib/              # Shared utilities and storage
│   ├── shared/           # TypeScript types and Vite config
│   ├── worker/           # Web workers for background processing
│   ├── locales/          # Internationalization
│   ├── space-manager/    # Space and database management
│   ├── code-editor/      # Monaco-based code editor
│   ├── sandbox/          # Extension sandboxing system
│   ├── sync/             # Data synchronization
│   └── v3/               # V3 compiler for extensions
├── scripts/              # Build and utility scripts
└── static/               # Static assets
```

## Key Configuration Files

- **package.json**: Main project configuration with workspace setup
- **vite.config.ts**: Custom Vite configurations for web/desktop with PWA support
- **tsconfig.json**: TypeScript with path mapping for monorepo structure
- **tailwind.config.mjs**: Comprehensive Tailwind setup with custom theme
- **electron-builder.json**: Desktop app packaging configuration
- **.oxlintrc.json**: Linting rules with TypeScript and React support
- **vitest.config.ts**: Testing configuration with environment switching
- **pnpm-workspace.yaml**: Workspace package management

## Development Commands

```bash
# Web development
pnpm dev          # Start web app
pnpm build        # Build web app

# Desktop development  
pnpm dev:desktop  # Start desktop app
pnpm build:desktop # Build desktop app
pnpm pkg:desktop  # Package for distribution

# Code quality
pnpm lint         # Run oxlint
pnpm typecheck    # TypeScript checking
pnpm test         # Run Vitest tests
```

## Architecture Highlights

### Extension System
- **Blocks**: UI components for custom data display and interaction
- **Scripts**: TypeScript/JavaScript/Python processing logic callable by AI
- **Sandboxing**: Secure execution environment using custom V3 compiler

### Data Architecture
- **Offline-first**: Everything runs locally with SQLite
- **Real-time pipeline**: Change triggers and full-text/semantic search
- **File integration**: Both browser APIs and native file system access
- **Undo/redo**: Comprehensive data operation tracking

### AI Integration
- **Multi-provider support**: Unified interface for various LLM providers
- **Context-aware functions**: AI can access and manipulate data
- **Extension generation**: AI can create custom blocks and scripts
- **Embedding search**: Semantic search capabilities with vector embeddings

## Development Conventions

### Code Style Guidelines
- TypeScript-first with strict typing enabled
- Tailwind CSS for styling with mobile-first approach
- Component-based architecture with small, focused components
- Zustand for global state, React hooks for local state
- Comprehensive path mapping for clean imports (e.g., `@/components/*`)
- Use existing UI components from the design system

### Testing Strategy
- Vitest with jsdom environment for UI tests
- Node environment for specific packages
- Focus on critical functionality testing
- Test files should be co-located with source files when possible

### Build Considerations
- Increased memory allocation for complex builds (8GB heap)
- Desktop builds require native dependency management
- Web builds optimized for PWA deployment
- Extensions compiled and sandboxed for security

## Security Considerations

- Extension sandboxing prevents unauthorized access to system resources
- AI-generated code is executed in isolated environments
- Database operations are validated before execution
- File system access is controlled through designated APIs

## Getting Started

1. Install dependencies: `pnpm install`
2. Start development server: `pnpm dev`
3. For desktop development: `pnpm dev:desktop`
4. Run tests: `pnpm test`
5. Build for production: `pnpm build`

## Common Development Tasks

### Adding a New Package
1. Create package directory in `packages/`
2. Add `package.json` with workspace dependencies
3. Update `pnpm-workspace.yaml` if needed
4. Add TypeScript configuration with proper path mapping

### Working with Extensions
1. Extensions live in the user's space directory
2. Use the sandbox system for secure execution
3. Follow the V3 compiler specifications
4. Test extensions in both web and desktop environments

### Database Operations
1. Use the core package for all SQLite operations
2. Implement proper error handling and validation
3. Consider offline-first architecture
4. Use the real-time pipeline for reactive updates

This project follows a monorepo architecture with clear separation between applications and shared packages. The extension system and AI integration make it a sophisticated platform for personal data management.