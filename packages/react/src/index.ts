/**
 * @eidos.space/react
 *
 * React hooks and context for Eidos extensions
 *
 * @example
 * ```tsx
 * // In extension sandbox environment
 * import { useEidos } from '@eidos.space/react'
 *
 * export function MyExtension() {
 *   const eidos = useEidos()
 *   const [data, setData] = useState([])
 *
 *   useEffect(() => {
 *     eidos.currentSpace.table('myTable').findMany().then(setData)
 *   }, [eidos])
 *
 *   return <div>{data.length} rows</div>
 * }
 * ```
 *
 * @example
 * ```tsx
 * // In built-in environment (set the worker proxy)
 * import { useEidosStore } from '@eidos.space/react'
 *
 * // Initialize with worker proxy
 * const { setEidos } = useEidosStore()
 * setEidos(workerProxy)
 * ```
 */

// Context and hooks
export {
  useEidos,
  useEidosStore,
  createEidos,
} from "./context"

// Extension context with type inference
export {
  ExtensionReactContext,
  ExtensionContextProvider,
  useExtensionContext,
  isExtNodeContext,
  isTableViewContext,
  isFileHandlerContext,
  isSidebarBlockContext,
} from "./extension-context"
export type {
  BaseExtensionContext,
  ExtNodeContext,
  TableViewContext,
  FileHandlerContext,
  SidebarBlockContext,
  ExtensionContextType,
} from "./extension-context"

// Re-export core types for convenience
export type { Eidos, DataSpace, EidosTable } from "@eidos.space/core"
