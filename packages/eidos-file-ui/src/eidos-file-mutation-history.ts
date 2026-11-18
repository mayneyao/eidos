import type {
  EidosFileLogicalValue,
  EidosFileRow,
  EidosFileRowMutationResult,
  EidosFileRowsDeleteResult,
} from "@eidos.space/eidos-file"
import type { EidosFileEditorDataSource } from "./data-source"

export interface EidosFileMutationHistoryState {
  canUndo: boolean
  canRedo: boolean
  busy: boolean
  /** Changes only when history applies data, not when a View records a write. */
  revision: number
}

interface Command {
  apply(): Promise<Command>
}

export interface EidosFileHistoryRowUpdate {
  rowId: string
  fields: Record<string, EidosFileLogicalValue>
}

interface UpdateStep extends EidosFileHistoryRowUpdate {
  expected: Record<string, EidosFileLogicalValue>
}

function equalValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (left instanceof Uint8Array && right instanceof Uint8Array)
    return (
      left.length === right.length &&
      left.every((value, i) => value === right[i])
    )
  return false
}

/** One bounded, in-memory user history per data-source/file session. Runtime
 * owns deletion receipts and validation; this controller only orders actions. */
export class EidosFileMutationHistory {
  private undoEntries: Command[] = []
  private redoEntries: Command[] = []
  private listeners = new Set<() => void>()
  private pending = 0
  private receipts = new Set<string>()
  private tail: Promise<unknown> = Promise.resolve()
  private state: EidosFileMutationHistoryState = {
    canUndo: false,
    canRedo: false,
    busy: false,
    revision: 0,
  }
  readonly source: EidosFileEditorDataSource

  constructor(private readonly raw: EidosFileEditorDataSource) {
    const methods = new Map<PropertyKey, unknown>()
    this.source = new Proxy(raw, {
      get: (target, key) => {
        if (key === "updateRow") return this.updateRow
        if (key === "insertRow") return this.insertRow
        if (methods.has(key)) return methods.get(key)
        const value: unknown = Reflect.get(target, key, target)
        if (typeof value !== "function") return value
        const bound: unknown = value.bind(target)
        methods.set(key, bound)
        return bound
      },
    })
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  getSnapshot = () => this.state

  private publish(applied = false) {
    this.state = {
      canUndo: this.undoEntries.length > 0,
      canRedo: this.redoEntries.length > 0,
      busy: this.pending > 0,
      revision: this.state.revision + Number(applied),
    }
    this.listeners.forEach((listener) => listener())
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    this.pending += 1
    this.publish()
    const result = this.tail.then(operation)
    this.tail = result.catch(() => undefined)
    return result.finally(() => {
      this.pending -= 1
      this.publish()
    })
  }

  private record(command: Command) {
    this.undoEntries.push(command)
    this.undoEntries = this.undoEntries.slice(-50)
    this.redoEntries = []
    this.publish()
  }

  /** An unsupported committed mutation is a boundary, never a fake undo. */
  private barrier() {
    this.undoEntries = []
    this.redoEntries = []
    this.publish()
  }

  private deletionCommand(tableId: string, token: string): Command {
    return {
      apply: async () => {
        if (!this.raw.revertRowMutation)
          throw new Error("This data source does not support record undo")
        const inverse = await this.raw.revertRowMutation(tableId, token)
        if (!inverse.undoToken)
          throw new Error("The Runtime did not return a redo receipt")
        return this.deletionCommand(tableId, inverse.undoToken)
      },
    }
  }

  /** Hosts may own confirmation, permission and refresh side effects. Their
   * exact result is registered here rather than copied into a View's stack. */
  delete = <T extends EidosFileRowsDeleteResult | void>(
    operation: () => Promise<T>
  ): Promise<T> => {
    return this.enqueue(async () => {
      const result = await operation()
      if (
        result &&
        result.deletedCount > 0 &&
        (!result.undoToken || !this.receipts.has(result.undoToken))
      ) {
        if (result.undoToken && this.raw.revertRowMutation)
          this.record(this.deletionCommand(result.tableId, result.undoToken))
        else this.barrier()
        if (result.undoToken) {
          this.receipts.add(result.undoToken)
          if (this.receipts.size > 100)
            this.receipts.delete(this.receipts.values().next().value!)
        }
      }
      return result
    })
  }

  // Creation was not reversible in the existing Grid history. Keep that
  // explicit boundary until the Runtime negotiates general mutation undo.
  private insertRow: EidosFileEditorDataSource["insertRow"] = (...args) =>
    this.enqueue(async () => {
      const result = await this.raw.insertRow(...args)
      this.barrier()
      return result
    })

  private updateCommand(tableId: string, steps: UpdateStep[]): Command {
    // Retain progress if a later write fails: retry resumes the remaining
    // inverse, and never replays or silently forgets a successful prefix.
    let cursor = 0
    const inverse: UpdateStep[] = []
    return {
      apply: async () => {
        if (!this.raw.getRow)
          throw new Error("This data source cannot read records for undo")
        for (let i = cursor; i < steps.length; i += 1) {
          const step = steps[i]!
          const row = await this.raw.getRow(tableId, step.rowId)
          if (
            !row ||
            Object.entries(step.expected).some(
              ([key, value]) => !equalValue(row[key], value)
            )
          )
            throw new Error(
              "This record changed since the operation; refresh before retrying undo"
            )
        }
        for (; cursor < steps.length; cursor += 1) {
          const step = steps[cursor]!
          const result = await this.raw.updateRow(
            tableId,
            step.rowId,
            step.fields
          )
          inverse.unshift({
            rowId: step.rowId,
            fields: step.expected,
            expected: this.pick(result.row, Object.keys(step.fields)),
          })
        }
        return this.updateCommand(tableId, inverse)
      },
    }
  }

  private pick(
    row: EidosFileRow,
    keys: string[]
  ): Record<string, EidosFileLogicalValue> {
    return Object.fromEntries(keys.map((key) => [key, row[key] ?? null]))
  }

  updateRows = (
    tableId: string,
    updates: EidosFileHistoryRowUpdate[]
  ): Promise<EidosFileRowMutationResult[]> =>
    this.enqueue(async () => {
      const results: EidosFileRowMutationResult[] = []
      const inverse: UpdateStep[] = []
      let reversible = true
      try {
        for (const update of updates) {
          const previous = await this.raw.getRow?.(tableId, update.rowId)
          const result = await this.raw.updateRow(
            tableId,
            update.rowId,
            update.fields
          )
          results.push(result)
          const keys = Object.keys(update.fields)
          if (
            previous &&
            keys.every(
              (key) =>
                Object.hasOwn(previous, key) && Object.hasOwn(result.row, key)
            )
          ) {
            const fields = this.pick(previous, keys)
            const expected = this.pick(result.row, keys)
            if (keys.some((key) => !equalValue(fields[key], expected[key])))
              inverse.unshift({ rowId: update.rowId, fields, expected })
          } else {
            this.barrier()
            reversible = false
          }
        }
      } finally {
        if (reversible && inverse.length > 0)
          this.record(this.updateCommand(tableId, inverse))
      }
      return results
    })

  private updateRow: EidosFileEditorDataSource["updateRow"] = async (
    tableId,
    rowId,
    fields
  ) => (await this.updateRows(tableId, [{ rowId, fields }]))[0]!

  undo = () => this.apply("undo")
  redo = () => this.apply("redo")
  private apply(direction: "undo" | "redo"): Promise<boolean> {
    if (this.pending > 0) return Promise.resolve(false)
    const from = direction === "undo" ? this.undoEntries : this.redoEntries
    const to = direction === "undo" ? this.redoEntries : this.undoEntries
    const command = from.at(-1)
    if (!command) return Promise.resolve(false)
    return this.enqueue(async () => {
      try {
        const inverse = await command.apply()
        from.pop()
        to.push(inverse)
        return true
      } finally {
        this.publish(true)
      }
    })
  }
}

const sessions = new WeakMap<
  EidosFileEditorDataSource,
  EidosFileMutationHistory
>()
export function eidosFileMutationHistory(
  source: EidosFileEditorDataSource
): EidosFileMutationHistory {
  let history = sessions.get(source)
  if (!history) {
    history = new EidosFileMutationHistory(source)
    sessions.set(source, history)
    sessions.set(history.source, history)
  }
  return history
}
