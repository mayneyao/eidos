import type { GraftSdkWorkerResponse } from "../../../shared/graft-sdk-contracts"

if (process.env.EIDOS_TEST_STALLED_NATIVE_ABORT === "1") {
  // Exercise the watchdog with a real blocked HTTP/native request that ignores
  // cooperative cancellation, as some upstream request stages currently do.
  globalThis.AbortController = class extends AbortController {
    override abort(): void {}
  }
}

// Node IPC supplies the same parent-port surface as Electron's utility process.
// The production worker, cancellation policy, native SDK and OS process exit
// are unchanged, so this tests real lock release rather than a mocked abort.
Object.defineProperty(process, "parentPort", {
  value: {
    on: (_event: string, listener: (event: { data: unknown }) => void) =>
      process.on("message", (data) => listener({ data })),
    postMessage: (message: GraftSdkWorkerResponse) => process.send?.(message),
  },
})

if (process.argv[2]) await import(process.argv[2])
else await import("../../../runtime/graft-worker")
