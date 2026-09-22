import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { Zap } from "lucide-react"
import type { EidosFileRowRange } from "@eidos.space/eidos-file"

export interface EidosFileActionTarget {
  ranges: readonly EidosFileRowRange[] | null
  rowId?: string
}
export interface EidosFileTableActions {
  list(
    target: EidosFileActionTarget
  ): Promise<Array<{ id: string; title: string; icon?: ReactNode }>>
  run(id: string, target: EidosFileActionTarget): void
}
export const EidosFileTableActionsContext =
  createContext<EidosFileTableActions | null>(null)
export function EidosFileTableActionMenu({
  target,
  onClose,
}: {
  target: EidosFileActionTarget
  onClose(): void
}) {
  const actions = useContext(EidosFileTableActionsContext)
  const [items, setItems] = useState<
    Array<{ id: string; title: string; icon?: ReactNode }>
  >([])
  const [error, setError] = useState("")
  const key = JSON.stringify(target)
  useEffect(() => {
    if (!actions) return
    let live = true
    void actions.list(JSON.parse(key) as EidosFileActionTarget).then(
      (next) => {
        if (live) {
          setItems(next)
          setError("")
        }
      },
      (cause) => {
        if (live) setError(String(cause))
      }
    )
    return () => {
      live = false
    }
  }, [actions, key])
  return (
    <>
      {items.length > 0 && (
        <div role="separator" className="my-1 h-px bg-border" />
      )}
      {items.map((item) => (
        <button
          key={item.id}
          role="menuitem"
          className="flex h-7 w-full items-center gap-2 rounded-[3px] px-2 text-left text-xs text-popover-foreground outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent"
          onClick={() => {
            onClose()
            actions?.run(item.id, target)
          }}
        >
          <span
            aria-hidden="true"
            className="flex h-3.5 w-3.5 shrink-0 items-center justify-center"
          >
            {item.icon ?? <Zap className="h-3.5 w-3.5" />}
          </span>
          {item.title}
        </button>
      ))}
      {error && (
        <p role="alert" className="px-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </>
  )
}
