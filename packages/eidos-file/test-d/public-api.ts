import {
  EidosFileHandlerRegistry,
  EidosFileSession,
  type EidosFileDataSource,
  type EidosFileDescriptor,
  type EidosFileHandle,
  type EidosFileRuntimeAdapter,
  type RuntimeHostBridge,
  type RequestContext,
} from "@eidos.space/eidos-file"
import {
  EidosFileBrowserRuntime,
  IndexedDbEidosFileRecoveryStore,
  openBrowserEidosFile,
  type EidosFileHandle as BrowserEidosFileHandleContract,
} from "@eidos.space/eidos-file/browser"
import {
  NodeSqliteConnectionPort,
  NodeSqliteEidosFileConnection,
  type NodeSqliteConnectionPortOptions,
} from "@eidos.space/eidos-file/node-sqlite"

const runtime: EidosFileRuntimeAdapter = new EidosFileBrowserRuntime()
const session = new EidosFileSession(
  runtime,
  new IndexedDbEidosFileRecoveryStore()
)
const registry = new EidosFileHandlerRegistry()

async function open(file: File): Promise<EidosFileDataSource | null> {
  const handle: EidosFileHandle & BrowserEidosFileHandleContract =
    await openBrowserEidosFile(file)
  await session.open(handle)
  return session.getState().source
}

function revision(descriptor: EidosFileDescriptor): string {
  return descriptor.revision
}

void open
void registry
void revision
void NodeSqliteConnectionPort
void NodeSqliteEidosFileConnection
void ({} satisfies NodeSqliteConnectionPortOptions)

function hostReadTypes(bridge: RuntimeHostBridge, context: RequestContext) {
  if (!bridge.queuedRead) return
  const value: Promise<Map<string, number>> = bridge.queuedRead(
    () => new Map([["value", 1]]),
    context
  )
  // @ts-expect-error Host read operations cannot be asynchronous.
  void bridge.queuedRead(async () => 1, context)
  // @ts-expect-error Host read operations cannot return a thenable.
  void bridge.queuedRead(() => Promise.resolve(1), context)
  // @ts-expect-error Non-Promise thenables also cannot leave the read callback.
  void bridge.queuedRead(() => ({ then: () => undefined }), context)
  void value
}
void hostReadTypes
