import type {
  RequestContext,
  RuntimeService,
  SchemaLeafChange,
  SchemaMutationResult,
} from "./runtime-contract"

// Private host composition; this is not a Runtime protocol operation.
export type InitialCliTable = Extract<
  SchemaLeafChange,
  { kind: "create-table" }
>
export interface InitialCliTableResult {
  schema: Pick<SchemaMutationResult, "revision" | "changed" | "createdObjects">
  tableId: string
  viewId: string
}
type Initializer = (
  change: InitialCliTable,
  context: RequestContext
) => Promise<InitialCliTableResult>
const initializers = new WeakMap<RuntimeService, Initializer>()

export function registerCliTableInitializer(
  service: RuntimeService,
  initialize: Initializer
): void {
  initializers.set(service, initialize)
}

export function initializeCliTable(
  service: RuntimeService,
  change: InitialCliTable,
  context: RequestContext
): Promise<InitialCliTableResult> {
  const initialize = initializers.get(service)
  if (!initialize) throw new Error("Unsupported CLI initialization host")
  return initialize(change, context)
}
