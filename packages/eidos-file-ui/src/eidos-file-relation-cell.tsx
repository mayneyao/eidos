import { useEffect, useMemo, useRef, useState } from "react"
import type { EidosFileRelationValue } from "@eidos.space/eidos-file"
import {
  decodeEidosFileRelationIds,
  encodeEidosFileRelationIds,
} from "@eidos.space/eidos-file"
import {
  GridCellKind,
  type CustomCell,
  type CustomRenderer,
  type ProvideEditorComponent,
} from "@glideapps/glide-data-grid"
import { Link2, Search } from "lucide-react"

import { drawDrilldownCell } from "./cells/grid-cell-helper"
import { useEidosFileUI } from "./context"
import { Button, Input, Popover, PopoverTrigger } from "./ui/primitives"

import { useEidosFileRelationListbox } from "./eidos-file-relation-listbox"
import { EidosFileRelationOptionList } from "./eidos-file-relation-option-list"
import {
  EIDOS_FILE_GRID_EDITOR_BODY_CLASS_NAME,
  EIDOS_FILE_GRID_EDITOR_CONTROL_CLASS_NAME,
  EIDOS_FILE_GRID_EDITOR_FOOTER_CLASS_NAME,
  EidosFileGridEditorHeader,
  EidosFileGridEditorPopoverContent,
  EidosFileGridEditorSurface,
  eidosFileGridPopupEditor,
} from "./cells/grid-editor-surface"

interface EidosFileRelationCellData {
  readonly kind: "eidos-file-relation-cell"
  readonly values: EidosFileRelationValue[]
  readonly multiple: boolean
  readonly targetTableId?: string
  readonly onSearch?: (query: string) => Promise<EidosFileRelationValue[]>
}

export type EidosFileRelationCell = CustomCell<EidosFileRelationCellData>

export const EidosFileRelationCellEditor: ProvideEditorComponent<
  EidosFileRelationCell
> = ({ value: cell, onChange, onFinishedEditing }) => {
  const { translate: t } = useEidosFileUI()
  const [query, setQuery] = useState("")
  const [options, setOptions] = useState<EidosFileRelationValue[]>([])
  const [values, setValues] = useState(cell.data.values)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(true)
  const requestRef = useRef(0)

  useEffect(() => {
    if (!cell.data.onSearch) return
    const request = ++requestRef.current
    const timer = setTimeout(
      () => {
        setLoading(true)
        setError(null)
        void cell.data
          .onSearch?.(query)
          .then((result) => {
            if (request === requestRef.current) setOptions(result)
          })
          .catch((searchError) => {
            if (request !== requestRef.current) return
            setError(
              searchError instanceof Error
                ? searchError.message
                : t("Unable to load records")
            )
          })
          .finally(() => {
            if (request === requestRef.current) setLoading(false)
          })
      },
      query ? 120 : 0
    )
    return () => {
      clearTimeout(timer)
      if (requestRef.current === request) requestRef.current += 1
    }
  }, [cell.data, query])

  const selectedIds = useMemo(
    () => new Set(values.map((value) => value.id)),
    [values]
  )
  const available = useMemo(
    () => options.filter((option) => !selectedIds.has(option.id)),
    [options, selectedIds]
  )
  const choices = useMemo(() => [...values, ...available], [available, values])
  const {
    activeOption,
    activeOptionId,
    activeDescendantId,
    listboxId,
    moveActiveOption,
    optionId,
    setActiveOptionId,
  } = useEidosFileRelationListbox(choices)

  useEffect(() => {
    setActiveOptionId(available[0]?.id ?? values[0]?.id ?? null)
  }, [available, setActiveOptionId, values])

  const update = (values: EidosFileRelationValue[]) => {
    setValues(values)
    onChange({
      ...cell,
      copyData:
        encodeEidosFileRelationIds(values.map((value) => value.id)) ?? "",
      data: { ...cell.data, values },
    })
  }
  const toggle = (option: EidosFileRelationValue) => {
    if (selectedIds.has(option.id)) {
      update(values.filter((value) => value.id !== option.id))
      return
    }
    update(cell.data.multiple ? [...values, option] : [option])
  }
  const finish = () => {
    setOpen(false)
    onFinishedEditing({
      ...cell,
      copyData:
        encodeEidosFileRelationIds(values.map((value) => value.id)) ?? "",
      data: { ...cell.data, values },
    })
  }

  return (
    <Popover open={open}>
      <PopoverTrigger>
        <div />
      </PopoverTrigger>
      <EidosFileGridEditorPopoverContent
        role="presentation"
        onPointerDownOutside={finish}
      >
        <EidosFileGridEditorSurface
          className="max-h-[390px] min-h-48"
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.nativeEvent.isComposing &&
              !(
                event.target instanceof Element &&
                event.target.closest("button, input")
              )
            ) {
              event.preventDefault()
              finish()
            }
          }}
        >
          <EidosFileGridEditorHeader
            icon={<Link2 />}
            title={t("Link records")}
          />
          <div
            className={`relative ${EIDOS_FILE_GRID_EDITOR_CONTROL_CLASS_NAME}`}
          >
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              autoFocus
              role="combobox"
              aria-label={t("Search relation records")}
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-activedescendant={activeDescendantId}
              aria-busy={loading}
              className="h-8 pl-8 text-xs"
              placeholder={t("Search records")}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault()
                  event.stopPropagation()
                  moveActiveOption(event.key === "ArrowDown" ? 1 : -1)
                  return
                }
                if (event.key === "Home" || event.key === "End") {
                  event.preventDefault()
                  event.stopPropagation()
                  moveActiveOption(event.key === "Home" ? "first" : "last")
                  return
                }
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  event.stopPropagation()
                  if (event.metaKey || event.ctrlKey || !activeOption) {
                    finish()
                  } else {
                    toggle(activeOption)
                  }
                }
              }}
            />
          </div>
          <div className={EIDOS_FILE_GRID_EDITOR_BODY_CLASS_NAME}>
            <EidosFileRelationOptionList
              accessibleName={t("Relation records")}
              activeOptionId={activeOptionId}
              availableValues={available}
              listboxId={listboxId}
              multiple={cell.data.multiple}
              optionId={optionId}
              query={query}
              selectedValues={values}
              targetTableId={cell.data.targetTableId}
              onActiveOptionChange={setActiveOptionId}
              onOpenRecord={finish}
              onToggle={toggle}
            />
            {!loading && !error && available.length === 0 ? (
              <p className="px-2 py-5 text-center text-xs text-muted-foreground">
                {values.length > 0 && !query
                  ? t("All loaded records are linked")
                  : t("No records found")}
              </p>
            ) : null}
            {loading ? (
              <p
                className="px-2 py-5 text-center text-xs text-muted-foreground"
                role="status"
              >
                {t("Loading…")}
              </p>
            ) : null}
            {error ? (
              <p className="px-2 py-3 text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <div
            className={`${EIDOS_FILE_GRID_EDITOR_FOOTER_CLASS_NAME} justify-between`}
          >
            <span>{t("Arrow keys navigate · Enter selects")}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={finish}
            >
              {t("Done")}
            </Button>
          </div>
        </EidosFileGridEditorSurface>
      </EidosFileGridEditorPopoverContent>
    </Popover>
  )
}

export const EidosFileRelationCellRenderer: CustomRenderer<EidosFileRelationCell> =
  {
    kind: GridCellKind.Custom,
    isMatch: (cell: CustomCell): cell is EidosFileRelationCell =>
      (cell.data as { kind?: unknown }).kind === "eidos-file-relation-cell",
    needsHover: false,
    needsHoverPosition: false,
    measure: (context, cell, theme) =>
      Math.max(
        160,
        cell.data.values.reduce(
          (width, value) => width + context.measureText(value.title).width + 24,
          theme.cellHorizontalPadding * 2
        )
      ),
    draw: (args) => drawDrilldownCell(args, args.cell.data.values),
    provideEditor: () => eidosFileGridPopupEditor(EidosFileRelationCellEditor),
    onPaste: (value, data) => {
      try {
        const ids = decodeEidosFileRelationIds(value)
        if (!data.multiple && ids.length > 1) return undefined
        const titleById = new Map(
          data.values.map((entry) => [entry.id, entry.title])
        )
        return {
          ...data,
          values: ids.map((id) => ({ id, title: titleById.get(id) ?? id })),
        }
      } catch {
        return undefined
      }
    },
    onDelete: (cell) => ({
      ...cell,
      copyData: "",
      data: { ...cell.data, values: [] },
    }),
  }
