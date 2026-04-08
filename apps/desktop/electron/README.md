# Eidos Desktop - NestJS-style DI Architecture

This directory contains the Electron main process code, now organized using a **NestJS-style Dependency Injection (DI)** architecture powered by **Inversify**.

## Architecture Overview

```
electron/
├── common/di/          # DI system core
│   ├── container.ts    # Inversify container
│   ├── decorators.ts   # @Module, @Injectable, @IpcInjectable
│   ├── module-scanner.ts  # Module scanning & registration
│   └── bootstrap.ts    # Application bootstrap
├── modules/            # Feature modules
│   ├── config/         # Configuration module
│   ├── file-system/    # File system operations
│   ├── sync/           # Data synchronization
│   └── ...             # More modules
├── app.module.ts       # Root module
└── main.ts            # Entry point
```

## Quick Start

### Creating a Service

```typescript
// modules/feature/feature.service.ts
import { IpcServiceBase } from "@eidos.space/electron-ipc"
import { IpcInjectable, Inject } from "../../common/di"
import { ConfigService } from "../config/config.module"

@IpcInjectable("feature") // IPC namespace: "feature:methodName"
export class FeatureService extends IpcServiceBase {
  constructor(@Inject(ConfigService) private config: ConfigService) {
    super()
  }

  async doSomething(): Promise<string> {
    const dataFolder = this.config.getAppDataFolder()
    return `Working with: ${dataFolder}`
  }
}
```

### Creating a Module

```typescript
// modules/feature/feature.module.ts
import { Module } from "../../common/di"
import { FeatureService } from "./feature.service"

@Module({
  imports: [ConfigModule], // Dependencies
  providers: [FeatureService], // Services to instantiate
  exports: [FeatureService], // Services available to other modules
})
export class FeatureModule {}
```

### Adding to Root Module

```typescript
// app.module.ts
import { Module } from "./common/di"
import { ConfigModule } from "./modules/config/config.module"
import { FeatureModule } from "./modules/feature/feature.module"

@Module({
  imports: [ConfigModule, FeatureModule],
})
export class AppModule {}
```

## Decorators Reference

### @Module(metadata)

Marks a class as a NestJS-style module.

```typescript
@Module({
  imports: [OtherModule],      // Modules this module depends on
  providers: [MyService],      // Services to instantiate
  exports: [MyService],        // Services available to other modules
  global: false,               // Whether this module is global
})
```

### @Injectable()

Marks a class as injectable (can be used with `@Inject()`).

```typescript
@Injectable()
export class MyHelper {
  doHelp() { ... }
}
```

### @IpcInjectable(namespace, options?)

Combines `@Injectable()` with `@IpcService()` for IPC services.

```typescript
@IpcInjectable("my-service", { exposeMode: "all" })
export class MyService extends IpcServiceBase {
  async myMethod() { ... }  // Accessible via IPC: "my-service:myMethod"
}
```

### @Inject(ServiceClass)

Injects a dependency.

```typescript
@Injectable()
export class MyService {
  constructor(@Inject(ConfigService) private config: ConfigService) {}
}
```

## Migration Guide

### From Legacy Services

**Before (legacy):**

```typescript
// services/my-service.ts
export class MyService extends IpcServiceBase {
  async doSomething() { ... }
}
export const myService = new MyService()

// main.ts
myService.register()
```

**After (DI):**

```typescript
// modules/my/my.service.ts
@IpcInjectable("my")
export class MyService extends IpcServiceBase {
  async doSomething() { ... }
}

// modules/my/my.module.ts
@Module({ providers: [MyService] })
export class MyModule {}

// app.module.ts
@Module({ imports: [MyModule] })
export class AppModule {}

// main.ts - auto-registered via bootstrap!
await bootstrap(AppModule)
```

## Best Practices

1. **One service per file** - Keep services focused and single-purpose
2. **Use modules to organize** - Group related services in modules
3. **Inject dependencies** - Don't import singletons, use `@Inject()`
4. **Export what's needed** - Only export services other modules need
5. **Keep IPC services stateless** - They may be called from multiple renderers

## Troubleshooting

### "No matching bindings found"

The service is not registered. Make sure it's in a module's `providers` array.

### "Missing required @Inject decorator"

When using constructor injection, ensure the class has `@Injectable()` or `@IpcInjectable()`.

### Circular dependencies

Use `forwardRef()` to break circular dependencies:

```typescript
constructor(@Inject(forwardRef(() => OtherService)) private other: OtherService) {}
```
