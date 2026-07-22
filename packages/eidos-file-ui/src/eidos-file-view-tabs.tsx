import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react"
import type { EidosFileViewInfo } from "@eidos.space/eidos-file"
import { Pencil, Settings2, Trash2 } from "lucide-react"

import { EidosFileViewTabStrip } from "./eidos-file-editor-chrome"
import { useEidosFileUI } from "./context"
import {
  EidosFileViewSelector,
  eidosFileExtensionContributionId,
  isEidosFileBuiltInViewType,
  type EidosFileViewSelectorRequest,
} from "./eidos-file-view-selector"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "./ui/context-menu"

export interface EidosFileViewTabActions {
  canDelete: boolean
  configure: () => void
  delete: () => void
  deleteDisabledReason?: string
  disabled: boolean
  rename: () => void
}

export type EidosFileViewTabRenderer = (
  view: EidosFileViewInfo,
  tab: ReactNode,
  actions: EidosFileViewTabActions
) => ReactNode

export type EidosFileViewTabsProps = Omit<
  ComponentProps<typeof EidosFileViewSelector>,
  "request" | "triggerMode"
> & {
  renderTab?: EidosFileViewTabRenderer
}

function EidosFileViewTabContextMenu({
  tab,
  actions,
}: {
  tab: ReactNode
  actions: EidosFileViewTabActions
}) {
  const { translate: t } = useEidosFileUI()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", closeOnEscape, true)
    return () => window.removeEventListener("keydown", closeOnEscape, true)
  }, [open])

  const afterMenuClose = (action: () => void) => {
    window.setTimeout(action, 0)
  }

  return (
    <ContextMenu onOpenChange={setOpen}>
      <ContextMenuTrigger asChild>{tab}</ContextMenuTrigger>
      <ContextMenuContent
        className="w-44"
        onCloseAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={() => setOpen(false)}
      >
        <ContextMenuItem
          disabled={actions.disabled}
          onSelect={() => afterMenuClose(actions.rename)}
        >
          <Pencil />
          {t("Rename view")}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={actions.disabled}
          onSelect={() => afterMenuClose(actions.configure)}
        >
          <Settings2 />
          {t("Configure view")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          disabled={!actions.canDelete}
          title={actions.deleteDisabledReason}
          onSelect={() => afterMenuClose(actions.delete)}
        >
          <Trash2 />
          {t("Delete view")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function EidosFileViewTabs({
  renderTab,
  ...props
}: EidosFileViewTabsProps) {
  const { translate: t } = useEidosFileUI()
  const { views, activeView, disabled, onSelect } = props
  const rootRef = useRef<HTMLDivElement>(null)
  const requestIdRef = useRef(0)
  const [selectorRequest, setSelectorRequest] =
    useState<EidosFileViewSelectorRequest | null>(null)
  const supportedViews = views.filter(
    (view) =>
      isEidosFileBuiltInViewType(view.type) ||
      eidosFileExtensionContributionId(view.type)
  )
  const gridViewCount = views.filter((view) => view.type === "grid").length

  const requestPanel = (
    view: EidosFileViewInfo,
    panel: EidosFileViewSelectorRequest["panel"],
    focusName = false
  ) => {
    const tabElement = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>(
        "[data-eidos-file-view-id]"
      ) ?? []
    ).find((candidate) => candidate.dataset.eidosFileViewId === view.id)
    if (!tabElement) return
    const rect = tabElement.getBoundingClientRect()
    requestIdRef.current += 1
    setSelectorRequest({
      anchorRect: {
        height: rect.height,
        left: rect.left,
        top: rect.top,
        width: rect.width,
      },
      focusName,
      panel,
      requestId: requestIdRef.current,
      viewId: view.id,
    })
  }

  return (
    <div ref={rootRef} className="contents">
      <EidosFileViewTabStrip
        views={supportedViews}
        activeViewId={activeView?.id}
        disabled={disabled}
        onSelect={onSelect}
        renderTab={(view, tab) => {
          const canDelete =
            !disabled &&
            views.length > 1 &&
            !(view.type === "grid" && gridViewCount <= 1)
          const actions: EidosFileViewTabActions = {
            canDelete,
            configure: () => {
              if (!disabled) requestPanel(view, "manage")
            },
            delete: () => {
              if (canDelete) requestPanel(view, "delete")
            },
            deleteDisabledReason: disabled
              ? t("View changes are unavailable while saving")
              : view.type === "grid" && gridViewCount <= 1
                ? t("A table must keep one Grid view")
                : views.length <= 1
                  ? t("A table must keep one view")
                  : undefined,
            disabled: Boolean(disabled),
            rename: () => {
              if (!disabled) requestPanel(view, "manage", true)
            },
          }
          return renderTab ? (
            renderTab(view, tab, actions)
          ) : (
            <EidosFileViewTabContextMenu tab={tab} actions={actions} />
          )
        }}
        afterTabs={
          <>
            <EidosFileViewSelector
              {...props}
              viewAction={undefined}
              triggerMode="create"
            />
            <EidosFileViewSelector
              {...props}
              request={selectorRequest}
              triggerMode="context"
            />
          </>
        }
      />
    </div>
  )
}
