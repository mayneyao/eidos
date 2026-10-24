import type { BackgroundHost } from "@eidos.space/plugin-sdk"
import { HistoryLedger, mergeRows, readRows } from "./history"
declare const ctx: BackgroundHost
const storage = ctx.storage!
const prefix = `history/${ctx.spaceId}/`
// Independent runs write different objects, including simultaneous windows.
const key = prefix + ctx.instanceId
const ledger = new HistoryLedger((rows) =>
  storage.write(key, new TextEncoder().encode(JSON.stringify(rows)))
)
let paused = false
let failure: string | null = null
const flush = async () => {
  try {
    await ledger.flush()
    failure = null
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
    throw error
  }
}
setInterval(() => {
  if (!paused)
    void flush()
      .catch(() => {})
      .then(() => snapshot())
      .then((data) => postMessage({ type: "history", data }))
      .catch((error: Error) =>
        postMessage({ type: "history", data: { error: error.message } })
      )
}, 10000)
async function snapshot() {
  const groups = [ledger.snapshot()]
  for (const object of await storage.list(prefix)) {
    if (object.key === key) continue
    const bytes = await storage.read(object.key)
    if (bytes)
      groups.push(readRows(JSON.parse(new TextDecoder().decode(bytes))))
  }
  return {
    rows: mergeRows(groups),
    pending: ledger.pending,
    savedAt: ledger.savedAt,
    error: failure,
    instanceId: ctx.instanceId,
    running: !paused,
  }
}
addEventListener("message", (event: MessageEvent) => {
  const { requestId, data } = event.data ?? {}
  if (!requestId) return
  void (async () => {
    if (data?.command === "flush") await flush()
    if (data?.command === "prepare-stop") {
      // Disable the observer before flushing so successful stop cannot lose a later event.
      paused = true
      try {
        await flush()
      } catch (error) {
        paused = false
        throw error
      }
      postMessage({
        requestId,
        data: {
          rows: ledger.snapshot(),
          pending: ledger.pending,
          savedAt: ledger.savedAt,
          error: null,
          instanceId: ctx.instanceId,
          running: false,
        },
      })
      return
    }
    postMessage({ requestId, data: await snapshot() })
  })().catch((error: Error) =>
    postMessage({ requestId, data: { error: error.message } })
  )
})
ctx.events.on("file.opened", (event) => {
  if (!paused)
    ledger.record({ id: event.id, path: event.path, openedAt: event.timestamp })
})
