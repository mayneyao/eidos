# DI Migration Quick Reference

## What's Been Done

### 1. Core DI System (`common/di/`)

| File                | Purpose                                               |
| ------------------- | ----------------------------------------------------- |
| `container.ts`      | Inversify container + service identifiers             |
| `decorators.ts`     | `@Module`, `@Injectable`, `@IpcInjectable`, `@Inject` |
| `module-scanner.ts` | Module scanning & auto-registration                   |
| `bootstrap.ts`      | Application bootstrap function                        |
| `index.ts`          | Public API exports                                    |

### 2. Modules Created

```
modules/
├── config/           # ConfigModule - Configuration management
├── file-system/      # FileSystemModule - File operations
├── sync/             # SyncModule - Data sync & credentials
└── example/          # ExampleModule - DI demonstration
```

### 3. Entry Point Updated

`main.ts` now uses:

```typescript
import "reflect-metadata"
import { bootstrap } from "./common/di"
import { AppModule } from "./app.module"

await bootstrap(AppModule)
```

## How to Use

### Inject a Service

```typescript
import { Injectable, Inject } from "../common/di"
import { ConfigService } from "../config/config.module"

@Injectable()
export class MyService {
  constructor(@Inject(ConfigService) private config: ConfigService) {}
}
```

### Create IPC Service

```typescript
import { IpcServiceBase } from "@eidos.space/electron-ipc"
import { IpcInjectable, Inject } from "../common/di"

@IpcInjectable("my-service")
export class MyService extends IpcServiceBase {
  async myMethod(): Promise<string> {
    return "Hello from IPC!"
  }
}
```

### Create Module

```typescript
import { Module } from "../common/di"

@Module({
  imports: [ConfigModule],
  providers: [MyService],
  exports: [MyService],
})
export class MyModule {}
```

## Migrating Legacy Services

### Step 1: Move to `modules/<name>/`

```
services/my-service.ts → modules/my/my.service.ts
```

### Step 2: Add Decorators

**Before:**

```typescript
@IpcService("my")
export class MyService extends IpcServiceBase { ... }
export const myService = new MyService()
```

**After:**

```typescript
@IpcInjectable("my")
export class MyService extends IpcServiceBase {
  constructor(@Inject(ConfigService) private config: ConfigService) {
    super()
  }
  ...
}
```

### Step 3: Create Module

```typescript
@Module({ providers: [MyService] })
export class MyModule {}
```

### Step 4: Import in AppModule

```typescript
@Module({ imports: [..., MyModule] })
export class AppModule {}
```

### Step 5: Remove Legacy Registration

**In main.ts, remove:**

```typescript
// Remove these lines:
import { myService } from "./services/my-service"
myService.register()
```

## Testing

### Type Check

```bash
cd apps/desktop && pnpm typecheck
```

### Build

```bash
cd apps/desktop && pnpm build
```

### Dev Mode

```bash
cd apps/desktop && pnpm dev
```

## Rollback

If you need to rollback:

1. Restore `main.legacy.ts` to `main.ts`
2. Remove DI modules from `app.module.ts`
3. Keep using legacy service singletons
