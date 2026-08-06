import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import type {
  EidosFileFieldInfo,
  EidosFileViewInfo,
  UpdateEidosFileViewInput,
} from "@eidos.space/eidos-file"
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  GripVertical,
  MoreHorizontal,
  Plus,
  Puzzle,
  Trash2,
} from "lucide-react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { EidosFileViewTypeIcon } from "./eidos-file-editor-chrome"
import {
  eidosFileFieldKey,
  eidosFileViewVisibleSystemFields,
  isEidosFileRecordLabelField,
  visibleEidosFileFields,
} from "./eidos-file-field-visibility"
import { useEidosFileUI } from "./context"
import { cn } from "./lib/cn"
import {
  Button,
  Input,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "./ui/primitives"
import { SortableContainer } from "./ui/sortable"
import { isEidosFileRecordCoverField } from "./eidos-file-record-card-layout"

export interface EidosFileExternalViewContribution {
  id: string
  displayName: string
  description?: string | null
  extensionDisplayName?: string | null
  packageId?: string
  contentDigest?: string
  permissionHash?: string
}

type Panel = "list" | "create" | "manage" | "delete" | "card"
export interface EidosFileViewSelectorRequest {
  anchorRect: Pick<DOMRect, "height" | "left" | "top" | "width">
  focusName?: boolean
  panel: Extract<Panel, "manage" | "delete">
  requestId: number
  viewId: string
}
export type EidosFileBuiltInViewType = "grid" | "gallery" | "kanban"
export const EIDOS_FILE_EXTENSION_VIEW_PREFIX = "extension:"

export function eidosFileExtensionViewType(contributionId: string): string {
  return `${EIDOS_FILE_EXTENSION_VIEW_PREFIX}${contributionId}`
}

export function eidosFileExtensionContributionId(type: string): string | null {
  return type.startsWith(EIDOS_FILE_EXTENSION_VIEW_PREFIX)
    ? type.slice(EIDOS_FILE_EXTENSION_VIEW_PREFIX.length) || null
    : null
}

const VIEW_TYPES: Array<{
  type: EidosFileBuiltInViewType
  label: string
  description: string
}> = [
  { type: "grid", label: "Grid", description: "Rows and columns" },
  { type: "gallery", label: "Gallery", description: "Responsive cards" },
  { type: "kanban", label: "Kanban", description: "Grouped by Select" },
]

function defaultViewName(
  type: EidosFileBuiltInViewType,
  views: EidosFileViewInfo[],
  translate: (message: string) => string
): string {
  const label = VIEW_TYPES.find((candidate) => candidate.type === type)?.label
  const prefix = translate(label ?? "View")
  const names = new Set(views.map((view) => view.name.trim().toLowerCase()))
  let suffix = views.filter((view) => view.type === type).length + 1
  while (names.has(`${prefix} ${suffix}`.toLowerCase())) suffix += 1
  return `${prefix} ${suffix}`
}

export function isEidosFileBuiltInViewType(
  type: string
): type is EidosFileBuiltInViewType {
  return type === "grid" || type === "gallery" || type === "kanban"
}

function EidosFileViewLayoutPicker({
  value,
  disabled,
  hasSelectField,
  onChange,
}: {
  value: EidosFileBuiltInViewType | null
  disabled: boolean
  hasSelectField: boolean
  onChange: (type: EidosFileBuiltInViewType) => void
}) {
  const { translate: t } = useEidosFileUI()
  return (
    <div className="grid gap-1.5">
      <div
        className="grid grid-cols-3 gap-1.5"
        role="group"
        aria-label={t("View layout")}
      >
        {VIEW_TYPES.map((candidate) => {
          const unavailable = candidate.type === "kanban" && !hasSelectField
          return (
            <button
              key={candidate.type}
              type="button"
              className={cn(
                "grid min-h-16 place-items-center content-center gap-1 rounded-md border border-border/70 px-1.5 text-center outline-hidden hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45",
                value === candidate.type && "border-foreground/30 bg-accent"
              )}
              disabled={disabled || unavailable}
              aria-pressed={value === candidate.type}
              title={t(candidate.description)}
              onClick={() => onChange(candidate.type)}
            >
              <EidosFileViewTypeIcon
                type={candidate.type}
                className="h-4 w-4"
              />
              <span className="text-[11px]">{t(candidate.label)}</span>
            </button>
          )
        })}
      </div>
      {!hasSelectField ? (
        <p className="text-[11px] leading-4 text-muted-foreground">
          {t("Add a Select field to enable Kanban.")}
        </p>
      ) : null}
    </div>
  )
}

function SortableSelectorRow({
  id,
  label,
  disabled,
  children,
}: {
  id: string
  label: string
  disabled: boolean
  children: ReactNode
}) {
  const sortable = useSortable({ id, disabled })
  return (
    <div
      ref={sortable.setNodeRef}
      className={cn(
        "group flex min-w-0 items-center rounded-md",
        sortable.isDragging && "z-10 bg-accent shadow-sm"
      )}
      style={{
        opacity: sortable.isDragging ? 0.72 : 1,
        transform: CSS.Transform.toString(
          sortable.transform ? { ...sortable.transform, x: 0 } : null
        ),
        transition: sortable.transition,
      }}
    >
      <button
        ref={sortable.setActivatorNodeRef}
        type="button"
        className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground/50 outline-hidden hover:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
        aria-label={label}
        disabled={disabled}
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      {children}
    </div>
  )
}

export function EidosFileViewSelector({
  views,
  extensionViews = [],
  fields,
  activeView,
  disabled,
  onSelect,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
  onReorder,
  onUpdate,
  viewAction,
  triggerMode = "current",
  request,
}: {
  views: EidosFileViewInfo[]
  extensionViews?: EidosFileExternalViewContribution[]
  fields: EidosFileFieldInfo[]
  activeView?: EidosFileViewInfo
  disabled?: boolean
  onSelect: (viewId: string) => void
  onCreate: (name: string, type: string) => Promise<void>
  onRename: (viewId: string, name: string) => Promise<void>
  onDuplicate: (viewId: string) => Promise<void>
  onDelete: (viewId: string) => Promise<void>
  onReorder: (viewIds: string[]) => Promise<void>
  onUpdate: (viewId: string, changes: UpdateEidosFileViewInput) => Promise<void>
  viewAction?: ReactNode
  triggerMode?: "current" | "create" | "manage" | "context"
  request?: EidosFileViewSelectorRequest | null
}) {
  const { translate: t } = useEidosFileUI()
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<Panel>("list")
  const [managedViewId, setManagedViewId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [isDefaultName, setIsDefaultName] = useState(false)
  const [createType, setCreateType] = useState<string>("grid")
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const fitImageId = useId()
  const hideEmptyFieldsId = useId()
  const showEmptyGroupsId = useId()
  const wrapTextId = useId()
  const handledRequestIdRef = useRef<number | null>(null)
  const managedView = useMemo(
    () => views.find((view) => view.id === managedViewId),
    [managedViewId, views]
  )
  const gridViewCount = views.filter((view) => view.type === "grid").length
  const selectFields = fields.filter((field) => field.type === "select")
  const visibleFieldIds = new Set(
    visibleEidosFileFields(
      fields,
      managedView?.hiddenFields,
      eidosFileViewVisibleSystemFields(managedView)
    ).map(eidosFileFieldKey)
  )
  const coverFields = fields.filter(
    (field) =>
      visibleFieldIds.has(eidosFileFieldKey(field)) &&
      isEidosFileRecordCoverField(field)
  )
  const cardCandidateFields = fields.filter(
    (field) =>
      visibleFieldIds.has(eidosFileFieldKey(field)) &&
      !isEidosFileRecordLabelField(field) &&
      field.valueKind !== "system"
  )
  const configuredCardFieldIds = Array.isArray(
    managedView?.properties?.cardFields
  )
    ? managedView.properties.cardFields.filter(
        (fieldId): fieldId is string => typeof fieldId === "string"
      )
    : null
  const cardFieldIds = configuredCardFieldIds
    ? configuredCardFieldIds.filter((fieldId): fieldId is string =>
        cardCandidateFields.some(
          (field) => eidosFileFieldKey(field) === fieldId
        )
      )
    : cardCandidateFields.map(eidosFileFieldKey)
  const unavailableCardFieldIds = (configuredCardFieldIds ?? []).filter(
    (fieldId) =>
      !cardCandidateFields.some((field) => eidosFileFieldKey(field) === fieldId)
  )
  const selectedCardFields = cardFieldIds.flatMap((fieldId) => {
    const field = cardCandidateFields.find(
      (candidate) => eidosFileFieldKey(candidate) === fieldId
    )
    return field ? [field] : []
  })
  const unselectedCardFields = cardCandidateFields.filter(
    (field) => !cardFieldIds.includes(eidosFileFieldKey(field))
  )

  useEffect(() => {
    if (managedView) setName(managedView.name)
  }, [managedView])

  useEffect(() => {
    if (
      triggerMode !== "context" ||
      !request ||
      handledRequestIdRef.current === request.requestId
    ) {
      return
    }
    const requestedView = views.find((view) => view.id === request.viewId)
    if (!requestedView) return
    handledRequestIdRef.current = request.requestId
    setManagedViewId(requestedView.id)
    setName(requestedView.name)
    setLocalError(null)
    setPanel(request.panel)
    setOpen(true)
  }, [request, triggerMode, views])

  const contextAnchorStyle = useMemo<CSSProperties | undefined>(() => {
    if (triggerMode !== "context" || !request) return undefined
    return {
      display: "block",
      height: request.anchorRect.height,
      left: request.anchorRect.left,
      pointerEvents: "none",
      position: "fixed",
      top: request.anchorRect.top,
      width: request.anchorRect.width,
    }
  }, [request, triggerMode])

  const reset = () => {
    setPanel("list")
    setManagedViewId(null)
    setName("")
    setIsDefaultName(false)
    setCreateType("grid")
    setLocalError(null)
  }
  const prepareCreate = () => {
    setName(defaultViewName("grid", views, t))
    setIsDefaultName(true)
    setCreateType("grid")
    setLocalError(null)
    setPanel("create")
  }
  const run = async (operation: () => Promise<void>, after?: () => void) => {
    setLocalError(null)
    setBusy(true)
    try {
      await operation()
      setLocalError(null)
      after?.()
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : t("Unable to update view")
      )
    } finally {
      setBusy(false)
    }
  }
  const openManage = (view: EidosFileViewInfo) => {
    setManagedViewId(view.id)
    setName(view.name)
    setLocalError(null)
    setPanel("manage")
  }
  const create = () => {
    const nextName = name.trim()
    if (!nextName) return
    void run(
      () => onCreate(nextName, createType),
      () => {
        setOpen(false)
        reset()
      }
    )
  }
  const selectCreateType = (type: string, label: string) => {
    setCreateType(type)
    if (isDefaultName) {
      setName(
        isEidosFileBuiltInViewType(type)
          ? defaultViewName(type, views, t)
          : `${label} ${views.filter((view) => view.type === type).length + 1}`
      )
    }
  }
  const saveName = () => {
    const nextName = name.trim()
    if (!managedView || !nextName || nextName === managedView.name) return
    void run(() => onRename(managedView.id, nextName))
  }
  const updateProperties = (changes: Record<string, unknown>) => {
    if (!managedView) return
    void run(() =>
      onUpdate(managedView.id, {
        properties: { ...(managedView.properties ?? {}), ...changes },
      })
    )
  }
  const toggleCardField = (fieldId: string, checked: boolean) => {
    const next = checked
      ? [...cardFieldIds, fieldId]
      : cardFieldIds.filter((candidate) => candidate !== fieldId)
    updateProperties({
      cardFields: [...new Set([...next, ...unavailableCardFieldIds])],
    })
  }
  const changeManagedLayout = (type: EidosFileBuiltInViewType) => {
    if (
      !managedView ||
      !isEidosFileBuiltInViewType(managedView.type) ||
      managedView.type === type
    ) {
      return
    }
    if (type !== "kanban") {
      void run(() => onUpdate(managedView.id, { type }))
      return
    }
    const currentGroup = managedView.properties?.groupField
    const groupField =
      typeof currentGroup === "string" &&
      selectFields.some((field) => eidosFileFieldKey(field) === currentGroup)
        ? currentGroup
        : selectFields[0]
          ? eidosFileFieldKey(selectFields[0])
          : undefined
    if (!groupField) return
    void run(() =>
      onUpdate(managedView.id, {
        type,
        properties: {
          ...(managedView.properties ?? {}),
          groupField,
        },
      })
    )
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) reset()
        else if (triggerMode === "create") prepareCreate()
      }}
    >
      {triggerMode === "context" ? (
        contextAnchorStyle ? (
          <PopoverAnchor asChild>
            <span
              data-eidos-file-view-context-anchor
              aria-hidden="true"
              style={contextAnchorStyle}
            />
          </PopoverAnchor>
        ) : null
      ) : (
        <PopoverTrigger asChild>
          {triggerMode === "current" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 max-w-44 gap-1.5 px-2 text-xs"
              disabled={disabled}
            >
              <EidosFileViewTypeIcon
                type={activeView?.type ?? "grid"}
                className="h-3.5 w-3.5 shrink-0"
              />
              <span className="truncate">{activeView?.name ?? t("Views")}</span>
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-full w-8 shrink-0 rounded-none text-muted-foreground hover:text-foreground"
              aria-label={
                triggerMode === "create"
                  ? t("Add Eidos File view")
                  : t("Manage Eidos File views")
              }
              title={
                triggerMode === "create" ? t("New view") : t("Manage views")
              }
              disabled={disabled}
            >
              {triggerMode === "create" ? (
                <Plus className="h-3.5 w-3.5" />
              ) : (
                <MoreHorizontal className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </PopoverTrigger>
      )}
      <PopoverContent
        align={triggerMode === "current" ? "end" : "start"}
        className="max-h-[min(42rem,calc(100vh-2rem))] w-72 overflow-y-auto p-1.5"
      >
        {panel === "list" ? (
          <>
            <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("Views")}
            </div>
            <SortableContainer
              items={views}
              optimistic={false}
              disabled={Boolean(disabled) || busy}
              onReorder={(next) =>
                void run(() => onReorder(next.map((view) => view.id)))
              }
              className="max-h-64 space-y-0.5 overflow-x-hidden overflow-y-auto"
              renderItem={(view) => {
                const supported =
                  isEidosFileBuiltInViewType(view.type) ||
                  Boolean(eidosFileExtensionContributionId(view.type))
                return (
                  <SortableSelectorRow
                    id={view.id}
                    label={t("Reorder {name} view", { name: view.name })}
                    disabled={Boolean(disabled) || busy}
                  >
                    <button
                      type="button"
                      className={cn(
                        "flex h-8 min-w-0 flex-1 items-center gap-2 px-1.5 text-left text-xs disabled:cursor-not-allowed disabled:opacity-55",
                        view.id === activeView?.id && "bg-accent"
                      )}
                      disabled={!supported}
                      onClick={() => {
                        onSelect(view.id)
                        setOpen(false)
                      }}
                    >
                      <EidosFileViewTypeIcon
                        type={view.type}
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {view.name}
                      </span>
                      {!supported ? (
                        <span className="text-[10px] capitalize text-muted-foreground">
                          {view.type}
                        </span>
                      ) : view.id === activeView?.id ? (
                        <Check className="h-3.5 w-3.5 shrink-0" />
                      ) : null}
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mr-0.5 h-7 w-7 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={t("Manage {name} view", { name: view.name })}
                      onClick={() => openManage(view)}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </SortableSelectorRow>
                )
              }}
            />
            <div className="mt-1 border-t pt-1">
              <button
                type="button"
                className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-accent"
                onClick={prepareCreate}
              >
                <Plus className="h-3.5 w-3.5" />
                {t("New view")}
              </button>
              {viewAction}
            </div>
          </>
        ) : null}

        {panel === "create" ? (
          <div className="p-1.5">
            <button
              type="button"
              className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setPanel("list")}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {t("Views")}
            </button>
            <label
              className="text-xs font-medium"
              htmlFor="eidos-file-view-name"
            >
              {t("View name")}
            </label>
            <Input
              id="eidos-file-view-name"
              autoFocus
              className="mt-1.5 h-8 text-xs"
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setIsDefaultName(false)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") create()
              }}
            />
            <div className="mt-3 grid gap-1.5">
              <p className="text-xs font-medium">{t("Layout")}</p>
              <EidosFileViewLayoutPicker
                value={
                  isEidosFileBuiltInViewType(createType) ? createType : null
                }
                disabled={busy}
                hasSelectField={selectFields.length > 0}
                onChange={(type) => {
                  selectCreateType(
                    type,
                    VIEW_TYPES.find((candidate) => candidate.type === type)
                      ?.label ?? "View"
                  )
                }}
              />
              {extensionViews.length > 0 ? (
                <div className="mt-2 border-t pt-2">
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t("Extensions")}
                  </p>
                  <div className="grid gap-1">
                    {extensionViews.map((extensionView) => {
                      const type = eidosFileExtensionViewType(extensionView.id)
                      return (
                        <button
                          key={extensionView.id}
                          type="button"
                          className={cn(
                            "flex min-h-10 items-center gap-2 rounded-md border px-2 text-left outline-hidden hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring",
                            createType === type &&
                              "border-foreground/30 bg-accent"
                          )}
                          aria-pressed={createType === type}
                          disabled={busy}
                          onClick={() =>
                            selectCreateType(type, extensionView.displayName)
                          }
                        >
                          <Puzzle className="h-4 w-4 shrink-0" />
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium">
                              {extensionView.displayName}
                            </span>
                            <span className="block truncate text-[10px] text-muted-foreground">
                              {extensionView.description ??
                                extensionView.extensionDisplayName}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="mt-3 flex justify-end gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setPanel("list")}
              >
                {t("Cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs"
                disabled={busy || !name.trim()}
                onClick={create}
              >
                {t("Create")}
              </Button>
            </div>
          </div>
        ) : null}

        {panel === "manage" && managedView ? (
          <div className="p-1.5">
            <button
              type="button"
              className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setPanel("list")}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {t("Views")}
            </button>
            <label
              className="text-xs font-medium"
              htmlFor="eidos-file-managed-view-name"
            >
              {t("View name")}
            </label>
            <div className="mt-1.5 flex gap-1.5">
              <Input
                id="eidos-file-managed-view-name"
                autoFocus={Boolean(request?.focusName)}
                className="h-8 min-w-0 text-xs"
                value={name}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
                onFocus={(event) => {
                  if (request?.focusName) event.currentTarget.select()
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveName()
                }}
              />
              <Button
                type="button"
                size="sm"
                className="h-8 px-2.5 text-xs"
                disabled={
                  busy || !name.trim() || name.trim() === managedView.name
                }
                onClick={saveName}
              >
                {t("Save")}
              </Button>
            </div>
            {isEidosFileBuiltInViewType(managedView.type) ? (
              <div className="mt-3 grid gap-1.5 border-t pt-3">
                <p className="text-xs font-medium">{t("Layout")}</p>
                <EidosFileViewLayoutPicker
                  value={managedView.type}
                  disabled={busy}
                  hasSelectField={selectFields.length > 0}
                  onChange={changeManagedLayout}
                />
              </div>
            ) : (
              <p className="mt-1.5 text-[11px] capitalize text-muted-foreground">
                {managedView.type} layout
              </p>
            )}
            {managedView.type === "grid" ? (
              <div className="mt-3 grid gap-1.5 border-t pt-3">
                <p className="text-xs font-medium">{t("Row density")}</p>
                <Select
                  value={
                    typeof managedView.properties?.rowDensity === "string"
                      ? managedView.properties.rowDensity
                      : "standard"
                  }
                  disabled={busy}
                  onValueChange={(rowDensity) =>
                    updateProperties({ rowDensity })
                  }
                >
                  <SelectTrigger
                    className="h-8 text-xs"
                    aria-label={t("Grid row density")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">{t("Compact")}</SelectItem>
                    <SelectItem value="standard">{t("Standard")}</SelectItem>
                    <SelectItem value="comfortable">
                      {t("Comfortable")}
                    </SelectItem>
                    <SelectItem value="huge">{t("Huge")}</SelectItem>
                  </SelectContent>
                </Select>
                <label
                  className="mt-1 flex items-center justify-between gap-3 text-xs"
                  htmlFor={wrapTextId}
                >
                  <span>{t("Wrap text")}</span>
                  <Switch
                    id={wrapTextId}
                    aria-label={t("Wrap text")}
                    checked={managedView.properties?.textWrapping === true}
                    disabled={busy}
                    onCheckedChange={(textWrapping) =>
                      updateProperties({ textWrapping })
                    }
                  />
                </label>
              </div>
            ) : null}
            {managedView.type === "kanban" ? (
              <div className="mt-3 grid gap-1.5 border-t pt-3">
                <p className="text-xs font-medium">{t("Group by")}</p>
                <Select
                  value={
                    typeof managedView.properties?.groupField === "string"
                      ? managedView.properties.groupField
                      : undefined
                  }
                  disabled={busy || selectFields.length === 0}
                  onValueChange={(groupField) =>
                    updateProperties({ groupField })
                  }
                >
                  <SelectTrigger
                    className="h-8 text-xs"
                    aria-label={t("Kanban group field")}
                  >
                    <SelectValue placeholder={t("Choose a Select field")} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectFields.map((field) => (
                      <SelectItem
                        key={eidosFileFieldKey(field)}
                        value={eidosFileFieldKey(field)}
                      >
                        {field.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectFields.length === 0 ? (
                  <p className="text-[11px] leading-4 text-muted-foreground">
                    {t("Add a Select field before configuring this Kanban.")}
                  </p>
                ) : null}
                <label
                  className="mt-1 flex items-center justify-between gap-3 text-xs"
                  htmlFor={showEmptyGroupsId}
                >
                  <span>{t("Show empty groups")}</span>
                  <Switch
                    id={showEmptyGroupsId}
                    aria-label={t("Show empty groups")}
                    checked={managedView.properties?.showEmptyGroups !== false}
                    disabled={busy}
                    onCheckedChange={(showEmptyGroups) =>
                      updateProperties({ showEmptyGroups })
                    }
                  />
                </label>
              </div>
            ) : null}
            {managedView.type === "gallery" || managedView.type === "kanban" ? (
              <button
                type="button"
                className="mt-3 flex h-8 w-full items-center justify-between gap-2 rounded-md border border-border/70 px-2 text-left text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                disabled={busy}
                onClick={() => setPanel("card")}
              >
                <span className="font-medium">{t("Card appearance")}</span>
                <ChevronRight
                  className="h-3.5 w-3.5 text-muted-foreground"
                  aria-hidden
                />
              </button>
            ) : null}
            <div className="mt-3 grid gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 justify-start gap-1.5 text-xs"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => onDuplicate(managedView.id),
                    () => {
                      setOpen(false)
                      reset()
                    }
                  )
                }
              >
                <Copy className="h-3.5 w-3.5" />
                {t("Duplicate view")}
              </Button>
            </div>
            <button
              type="button"
              className="mt-3 flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={
                busy ||
                views.length <= 1 ||
                (managedView.type === "grid" && gridViewCount <= 1)
              }
              title={
                managedView.type === "grid" && gridViewCount <= 1
                  ? t("A table must keep one Grid view")
                  : undefined
              }
              onClick={() => setPanel("delete")}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("Delete view")}
            </button>
          </div>
        ) : null}

        {panel === "card" &&
        managedView &&
        (managedView.type === "gallery" || managedView.type === "kanban") ? (
          <div className="p-1.5">
            <button
              type="button"
              className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setPanel("manage")}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {managedView.name}
            </button>
            <div className="grid gap-1.5">
              <p className="text-xs font-medium">{t("Card content")}</p>
              <div className="max-h-44 overflow-x-hidden overflow-y-auto rounded-md border border-border/70 p-1">
                {cardCandidateFields.length > 0 ? (
                  <>
                    <SortableContainer
                      items={selectedCardFields.map((field) => ({
                        id: eidosFileFieldKey(field),
                        field,
                      }))}
                      optimistic={false}
                      disabled={busy}
                      onReorder={(next) =>
                        updateProperties({
                          cardFields: [
                            ...next.map(({ id }) => id),
                            ...unavailableCardFieldIds,
                          ],
                        })
                      }
                      className="grid gap-0.5"
                      renderItem={({ id: fieldId, field }) => (
                        <SortableSelectorRow
                          id={fieldId}
                          label={t("Reorder {field}", {
                            field: field.name,
                          })}
                          disabled={busy}
                        >
                          <label className="flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 px-1 text-xs">
                            <input
                              type="checkbox"
                              className="accent-primary"
                              checked
                              disabled={busy}
                              aria-label={t("Show {field} on cards", {
                                field: field.name,
                              })}
                              onChange={(event) =>
                                toggleCardField(
                                  fieldId,
                                  event.currentTarget.checked
                                )
                              }
                            />
                            <span className="truncate">{field.name}</span>
                          </label>
                        </SortableSelectorRow>
                      )}
                    />
                    {unselectedCardFields.map((field) => {
                      const fieldId = eidosFileFieldKey(field)
                      return (
                        <div
                          key={fieldId}
                          className="flex h-8 items-center rounded px-1.5 hover:bg-accent"
                        >
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              className="accent-primary"
                              checked={false}
                              disabled={busy}
                              aria-label={t("Show {field} on cards", {
                                field: field.name,
                              })}
                              onChange={(event) =>
                                toggleCardField(
                                  fieldId,
                                  event.currentTarget.checked
                                )
                              }
                            />
                            <span className="truncate">{field.name}</span>
                          </label>
                        </div>
                      )
                    })}
                  </>
                ) : (
                  <p className="px-2 py-3 text-[11px] text-muted-foreground">
                    {t("No fields are available for cards.")}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-3 grid gap-1.5 border-t pt-3">
              <p className="text-xs font-medium">{t("Card cover")}</p>
              <Select
                value={
                  typeof managedView.properties?.coverField === "string"
                    ? managedView.properties.coverField
                    : "__none__"
                }
                disabled={busy}
                onValueChange={(coverField) =>
                  updateProperties({
                    coverField: coverField === "__none__" ? null : coverField,
                  })
                }
              >
                <SelectTrigger
                  className="h-8 text-xs"
                  aria-label={t("{view} card cover", {
                    view:
                      managedView.type === "kanban"
                        ? t("Kanban")
                        : t("Gallery"),
                  })}
                >
                  <SelectValue placeholder={t("No cover")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("No cover")}</SelectItem>
                  {coverFields.map((field) => (
                    <SelectItem
                      key={eidosFileFieldKey(field)}
                      value={eidosFileFieldKey(field)}
                    >
                      {field.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {coverFields.length === 0 ? (
                <p className="text-[11px] leading-4 text-muted-foreground">
                  {t("Add a File field to use record images as card covers.")}
                </p>
              ) : null}
              {managedView.properties?.coverField ? (
                <label
                  className="flex items-center justify-between gap-3 text-xs"
                  htmlFor={fitImageId}
                >
                  <span>{t("Fit image")}</span>
                  <Switch
                    id={fitImageId}
                    aria-label={t("Fit image")}
                    checked={
                      managedView.properties?.coverFit === "contain" ||
                      (managedView.properties?.coverFit !== "cover" &&
                        managedView.properties?.fitContent === true)
                    }
                    disabled={busy}
                    onCheckedChange={(fitImage) =>
                      updateProperties({
                        coverFit: fitImage ? "contain" : "cover",
                      })
                    }
                  />
                </label>
              ) : null}
            </div>
            <div className="mt-3 grid gap-1.5 border-t pt-3">
              <p className="text-xs font-medium">{t("Card size")}</p>
              <div
                className="grid grid-cols-3 rounded-md border p-0.5"
                role="group"
                aria-label={t("Card size")}
              >
                {(["small", "medium", "large"] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={cn(
                      "h-7 rounded-[3px] text-[11px] capitalize hover:text-foreground",
                      (managedView.properties?.cardSize ?? "medium") === size
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground"
                    )}
                    disabled={busy}
                    aria-pressed={
                      (managedView.properties?.cardSize ?? "medium") === size
                    }
                    onClick={() => updateProperties({ cardSize: size })}
                  >
                    {t(size)}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
              <label htmlFor={hideEmptyFieldsId}>
                <p className="text-xs font-medium">{t("Hide empty fields")}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {t("Keep cards focused on populated properties.")}
                </p>
              </label>
              <Switch
                id={hideEmptyFieldsId}
                aria-label={t("Hide empty fields")}
                checked={managedView.properties?.hideEmptyFields !== false}
                disabled={busy}
                onCheckedChange={(hideEmptyFields) =>
                  updateProperties({ hideEmptyFields })
                }
              />
            </div>
          </div>
        ) : null}

        {panel === "delete" && managedView ? (
          <div className="p-2">
            <p className="text-sm font-medium">
              {t("Delete “{name}”?", { name: managedView.name })}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t(
                "This removes the saved layout, filters, and sorts. Table records are not deleted."
              )}
            </p>
            <div className="mt-3 flex justify-end gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                disabled={busy}
                onClick={() => setPanel("manage")}
              >
                {t("Cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => onDelete(managedView.id),
                    () => {
                      setOpen(false)
                      reset()
                    }
                  )
                }
              >
                {t("Delete")}
              </Button>
            </div>
          </div>
        ) : null}

        {localError ? (
          <p
            className="mx-2 mb-1 mt-2 break-words text-xs text-destructive"
            role="alert"
          >
            {localError}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
