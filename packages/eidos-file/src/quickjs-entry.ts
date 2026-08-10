// Polyfill module self-executes at evaluation time; calling the export keeps
// the module alive against the package's `sideEffects: false` tree-shaking,
// and evaluation order (first import) is what installs the globals before
// runtime-service dependencies capture them at their own module top level.
import { installQuickJsPolyfills } from "./quickjs/polyfills"

installQuickJsPolyfills()

import { Runtime } from "./runtime-service"
import type {
  RequestContext,
  RuntimeEnvironment,
  RuntimeHostBridge,
  RuntimeService,
} from "./runtime-contract"
import type { CancellationPort } from "./protocol-types"
import { QuickJsConnectionPort } from "./quickjs/port"
import { base64ToBytes, bytesToBase64 } from "./quickjs/wire"
import { runSelfTest } from "./quickjs/selftest"

interface EidosQuickJsRuntime {
  selfTest(): Promise<string>
  open(requestJson: string): Promise<string>
  allocateFileEntry(requestJson: string): Promise<string>
  call(
    method: string,
    requestJson: string,
    contextJson: string
  ): Promise<string>
  snapshot(): Promise<string>
  close(): Promise<string>
}

declare global {
  // eslint-disable-next-line no-var
  var __eidos_runtime: EidosQuickJsRuntime
}

const cancellation: CancellationPort = {
  cancelled: () => false,
  onCancel: () => () => undefined,
}

const liveEnvironment = (): RuntimeEnvironment => ({
  clock: {
    nowInstant: () => new Date().toISOString(),
    nowMilliseconds: () => Date.now(),
  },
  entropy: {
    randomBytes(length: number) {
      return base64ToBytes(globalThis.__eidos_host.randomBytes(length))
    },
  },
})

interface Session {
  port: QuickJsConnectionPort
  service: RuntimeService
  hostBridge: RuntimeHostBridge
}

let session: Session | null = null

function requireSession(): Session {
  if (!session) throw new Error("No open Eidos runtime session")
  return session
}

const SERIALIZABLE_METHODS = new Set([
  "negotiate",
  "getSnapshot",
  "getSchemaPage",
  "queryRows",
  "getRowsById",
  "aggregate",
  "groupRows",
  "queryGroupRows",
  "previewFormula",
  "mutateRows",
  "revertMutation",
  "mutateView",
  "preflightSchema",
  "getSchemaPlanDependencies",
  "mutateSchema",
  "validate",
  "exportCsv",
  "importCsv",
  "cancel",
])

const errorEnvelope = (error: unknown): string => {
  const candidate = error as {
    code?: unknown
    message?: unknown
    retryable?: unknown
  }
  return JSON.stringify({
    ok: false,
    error: {
      code: typeof candidate?.code === "string" ? candidate.code : "unknown",
      message:
        typeof candidate?.message === "string"
          ? candidate.message
          : String(error),
      retryable: candidate?.retryable === true,
    },
  })
}

globalThis.__eidos_runtime = {
  async selfTest(): Promise<string> {
    try {
      return await runSelfTest()
    } catch (error) {
      return JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
    }
  },

  async open(requestJson: string): Promise<string> {
    if (session) {
      const negotiation = await session.service.negotiate(
        { protocol: "eidos-runtime", versions: ["1.0"] },
        { requestId: "reopen-negotiate", deadlineMilliseconds: 30_000 }
      )
      return JSON.stringify({
        ok: true,
        capabilities: negotiation.capabilities,
      })
    }
    try {
      const request = JSON.parse(requestJson) as {
        mode: "create" | "open"
        title?: string
        access?: "read" | "readwrite"
      }
      const port = new QuickJsConnectionPort()
      globalThis.__eidos_scalar_dispatch = (name, argsJson) =>
        port.dispatchScalar(name, argsJson)
      const environment = liveEnvironment()
      const binding =
        request.mode === "create"
          ? await Runtime.create(
              port,
              environment,
              { title: request.title ?? "Untitled" },
              { cancellation }
            )
          : await Runtime.open(
              port,
              environment,
              request.access ?? "readwrite",
              { cancellation }
            )
      session = {
        port,
        service: binding.service,
        hostBridge: binding.hostBridge,
      }
      const negotiation = await binding.service.negotiate(
        { protocol: "eidos-runtime", versions: ["1.0"] },
        { requestId: "open-negotiate", deadlineMilliseconds: 30_000 }
      )
      return JSON.stringify({
        ok: true,
        capabilities: negotiation.capabilities,
      })
    } catch (error) {
      return errorEnvelope(error)
    }
  },

  async allocateFileEntry(requestJson: string): Promise<string> {
    try {
      const { hostBridge } = requireSession()
      const request = JSON.parse(requestJson) as {
        name: string
        mediaType: string
        size: string
        uri: string
      }
      const value = await hostBridge.allocateFileEntry(request, {
        requestId: "serve-asset-allocate",
        deadlineMilliseconds: 30_000,
      })
      return JSON.stringify({ ok: true, value })
    } catch (error) {
      return errorEnvelope(error)
    }
  },

  async call(
    method: string,
    requestJson: string,
    contextJson: string
  ): Promise<string> {
    try {
      const { service } = requireSession()
      if (!SERIALIZABLE_METHODS.has(method)) {
        throw new Error(`Unsupported runtime method: ${method}`)
      }
      const request = JSON.parse(requestJson) as Record<string, unknown>
      const context = JSON.parse(contextJson) as RequestContext
      // CSV payloads cross the HTTP JSON boundary as base64.
      if (method === "importCsv" && typeof request.csv === "string") {
        request.csv = base64ToBytes(request.csv)
      }
      const target = service as unknown as Record<
        string,
        (request: unknown, context: RequestContext) => Promise<unknown>
      >
      const result = await target[method]!(request, context)
      if (
        method === "exportCsv" &&
        result !== null &&
        typeof result === "object" &&
        "csv" in result
      ) {
        const csvResult = result as { csv: Uint8Array }
        return JSON.stringify({
          ok: true,
          value: { ...csvResult, csv: bytesToBase64(csvResult.csv) },
        })
      }
      return JSON.stringify({ ok: true, value: result ?? null })
    } catch (error) {
      return errorEnvelope(error)
    }
  },

  async snapshot(): Promise<string> {
    const { port } = requireSession()
    const snapshot = await port.transaction("read", async () => {
      port.get("SELECT count(*) FROM sqlite_schema")
      return port.snapshot({
        cancellation,
        deadlineMilliseconds: 30_000,
        maxBytes: "268435456",
      })
    })
    const bytes = await snapshot.bytes.read("0", Number(snapshot.bytes.size), {
      cancellation,
      deadlineMilliseconds: 30_000,
    })
    await snapshot.release()
    return bytesToBase64(bytes)
  },

  async close(): Promise<string> {
    const current = session
    session = null
    if (current) {
      const context: RequestContext = {
        requestId: "close",
        deadlineMilliseconds: 30_000,
      }
      await current.service.close(context)
      current.port.close()
    }
    return JSON.stringify({ ok: true })
  },
}
