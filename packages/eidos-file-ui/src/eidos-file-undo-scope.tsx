import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import type { EidosFileSnapshot } from "@eidos.space/eidos-file"
import type {
  EidosFileMutationHistory,
  EidosFileMutationHistoryState,
} from "./eidos-file-mutation-history"
import { useEidosFilePendingEdit } from "./use-pending-edit"

interface UndoScope extends EidosFileMutationHistoryState {
  history: EidosFileMutationHistory
  undo(): Promise<boolean>
  redo(): Promise<boolean>
  onCloseAutoFocus(event: Event): void
}
const Context = createContext<UndoScope | null>(null)

/** Views consume one file-session history. Text editors keep native undo. */
export function useEidosFileUndo() {
  return useContext(Context)
}

export function EidosFileUndoScope({
  history,
  disabled,
  onSnapshot,
  onError,
  children,
  focusKey,
  focusRequestToken,
  grid,
}: {
  history: EidosFileMutationHistory
  disabled: boolean
  onSnapshot?: (snapshot: EidosFileSnapshot) => void
  onError?: (error: unknown) => void
  children: ReactNode
  focusKey: string
  focusRequestToken: number
  grid: boolean
}) {
  const root = useRef<HTMLDivElement>(null)
  const state = useSyncExternalStore(
    history.subscribe,
    history.getSnapshot,
    history.getSnapshot
  )
  const latest = useRef({ history, onSnapshot, onError })
  latest.current = { history, onSnapshot, onError }
  const [error, setError] = useState<{
    owner: EidosFileMutationHistory
    message: string
  } | null>(null)
  useLayoutEffect(() => {
    const active = document.activeElement
    if (
      active instanceof HTMLElement &&
      active.closest(
        'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="menu"],[role="dialog"],[role="alertdialog"]'
      )
    )
      return // Only explicit View navigation changes this key. Data reloads never
      // reclaim focus; Glide retains its own canvas activation lifecycle.
    ;(
      root.current?.querySelector<HTMLElement>('[tabindex="0"]') ?? root.current
    )?.focus({ preventScroll: true })
  }, [history, focusKey, focusRequestToken, grid])
  useEidosFilePendingEdit(state.busy)
  useEffect(() => {
    if (state.revision === 0) return
    let disposed = false
    void history.source
      .getSnapshot()
      .then((snapshot) => {
        if (!disposed) latest.current.onSnapshot?.(snapshot)
      })
      .catch((cause) => {
        if (!disposed) latest.current.onError?.(cause)
      })
    return () => {
      disposed = true
    }
  }, [history, state.revision])
  const context: UndoScope = {
    ...state,
    history,
    undo: history.undo,
    redo: history.redo,
    onCloseAutoFocus: (event) => {
      event.preventDefault()
      if (latest.current.history !== history) return
      const active = document.activeElement
      if (
        active === document.body ||
        active === null ||
        (event.target instanceof Node && event.target.contains(active))
      )
        root.current?.focus({ preventScroll: true })
    },
  }
  return (
    <Context.Provider value={context}>
      <div
        ref={root}
        tabIndex={-1}
        data-eidos-file-undo-scope=""
        className="relative h-full min-h-0 w-full outline-none"
        onKeyDown={(event) => {
          if (
            disabled ||
            event.defaultPrevented ||
            event.nativeEvent.isComposing ||
            event.keyCode === 229 ||
            !(event.metaKey || event.ctrlKey)
          )
            return
          const target = event.target
          if (
            !(target instanceof HTMLElement) ||
            !event.currentTarget.contains(target) ||
            target.closest(
              'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="menu"],[role="dialog"],[role="alertdialog"]'
            )
          )
            return
          const key = event.key.toLowerCase()
          if (key !== "z" && key !== "y") return
          const redo = key === "y" || event.shiftKey
          if (!state.busy && !(redo ? state.canRedo : state.canUndo)) return
          event.preventDefault()
          event.stopPropagation()
          setError(null)
          void (redo ? history.redo() : history.undo()).catch((cause) => {
            if (latest.current.history !== history) return
            setError({
              owner: history,
              message: cause instanceof Error ? cause.message : String(cause),
            })
            latest.current.onError?.(cause)
          })
        }}
      >
        {children}
        {error?.owner === history ? (
          <p
            role="alert"
            className="absolute right-2 top-2 z-10 max-w-sm rounded border bg-popover px-2 py-1 text-xs text-destructive"
          >
            {error.message}
          </p>
        ) : null}
      </div>
    </Context.Provider>
  )
}
