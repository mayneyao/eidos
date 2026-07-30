import {
  EidosFileHandlerRegistry,
  EidosFileSession,
  type EidosFileDataSource,
  type EidosFileDescriptor,
  type EidosFileHandle,
  type EidosFileRuntimeAdapter,
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
