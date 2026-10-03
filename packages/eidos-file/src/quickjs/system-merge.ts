import { ConnectionPortEidosFileConnection } from "../connection-port"
import { mergeEidosSystemMetadata } from "../system-metadata-merge"
import { QuickJsConnectionPort, type QuickJsHostBridge } from "./port"

declare global {
  var __eidos_host_base: QuickJsHostBridge
  var __eidos_host_ours: QuickJsHostBridge
  var __eidos_host_theirs: QuickJsHostBridge
  var __eidos_scalar_dispatch_base: (name: string, argsJson: string) => string
  var __eidos_scalar_dispatch_ours: (name: string, argsJson: string) => string
  var __eidos_scalar_dispatch_theirs: (name: string, argsJson: string) => string
}

/** Host-owned snapshots; all merge decisions stay in the canonical Runtime. */
export function mergeQuickJsSystemMetadata(requestJson: string): string {
  if (
    !globalThis.__eidos_host_base ||
    !globalThis.__eidos_host_ours ||
    !globalThis.__eidos_host_theirs
  ) {
    throw new Error("Merge requires three dedicated input connections")
  }
  const request = JSON.parse(requestJson) as {
    oursKey: string
    theirsKey: string
    operationInstant: string | number
  }
  const base = new QuickJsConnectionPort({}, globalThis.__eidos_host_base)
  const ours = new QuickJsConnectionPort({}, globalThis.__eidos_host_ours)
  const theirs = new QuickJsConnectionPort({}, globalThis.__eidos_host_theirs)
  const result = new QuickJsConnectionPort()
  globalThis.__eidos_scalar_dispatch_base = (name, args) =>
    base.dispatchScalar(name, args)
  globalThis.__eidos_scalar_dispatch_ours = (name, args) =>
    ours.dispatchScalar(name, args)
  globalThis.__eidos_scalar_dispatch_theirs = (name, args) =>
    theirs.dispatchScalar(name, args)
  globalThis.__eidos_scalar_dispatch = (name, args) =>
    result.dispatchScalar(name, args)
  try {
    return JSON.stringify({
      ok: true,
      value: mergeEidosSystemMetadata({
        base: new ConnectionPortEidosFileConnection(base),
        ours: new ConnectionPortEidosFileConnection(ours),
        theirs: new ConnectionPortEidosFileConnection(theirs),
        result: new ConnectionPortEidosFileConnection(result),
        oursKey: request.oursKey,
        theirsKey: request.theirsKey,
        operationInstant:
          typeof request.operationInstant === "number"
            ? new Date(request.operationInstant).toISOString()
            : request.operationInstant,
      }),
    })
  } finally {
    result.close()
    theirs.close()
    ours.close()
    base.close()
  }
}
