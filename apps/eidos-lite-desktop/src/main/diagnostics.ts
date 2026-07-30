import type {
  EidosLiteDiagnosticLogEntry,
  EidosLiteDiagnostics,
  GraftSpaceStatus,
  SpaceOperationState,
} from "../shared/contracts"
import type { EidosLiteEnvironmentName } from "../shared/service-environment"

export interface EidosLiteDiagnosticInput {
  app: {
    name: string
    version: string
    packaged: boolean
  }
  platform: string
  arch: string
  electronVersion: string
  environment: EidosLiteEnvironmentName
  logs?: {
    retainedFiles: number
    currentBytes: number
    recent: EidosLiteDiagnosticLogEntry[]
  }
  space?: {
    eidosFileCount: number
    operation: Pick<SpaceOperationState, "phase" | "recoverable">
    graft: Pick<
      GraftSpaceStatus,
      | "available"
      | "backend"
      | "version"
      | "expectedVersion"
      | "initialized"
      | "clean"
    >
    residentRuntimeCount: number
    trackedRuntimeCount: number
  }
}

const DIAGNOSTIC_EXCLUSIONS = [
  "credentials and tokens",
  "Remote and service URLs",
  "absolute Space and file paths",
  "Space names and repository identifiers",
  "Eidos File contents and row data",
] as const

export function createEidosLiteDiagnostics(
  input: EidosLiteDiagnosticInput,
  generatedAt = new Date().toISOString()
): EidosLiteDiagnostics {
  return {
    schemaVersion: 1,
    generatedAt,
    app: {
      ...input.app,
      platform: input.platform,
      arch: input.arch,
      electronVersion: input.electronVersion,
    },
    environment: input.environment,
    space: input.space
      ? {
          open: true,
          eidosFileCount: input.space.eidosFileCount,
          operation: input.space.operation,
          graft: input.space.graft,
          runtime: {
            residentCount: input.space.residentRuntimeCount,
            trackedCount: input.space.trackedRuntimeCount,
          },
        }
      : { open: false },
    logs: {
      format: "jsonl",
      retainedFiles: input.logs?.retainedFiles ?? 0,
      currentBytes: input.logs?.currentBytes ?? 0,
      recent: input.logs?.recent ?? [],
    },
    privacy: { excludes: [...DIAGNOSTIC_EXCLUSIONS] },
  }
}

export function serializeEidosLiteDiagnostics(
  diagnostics: EidosLiteDiagnostics
): string {
  return `${JSON.stringify(diagnostics, null, 2)}\n`
}
