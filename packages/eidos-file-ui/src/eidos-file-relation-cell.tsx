import { useEffect, useMemo, useRef, useState } from "react"
import type { EidosFileRelationValue } from "@eidos.space/eidos-file"
import { encodeEidosFileRelationIds } from "@eidos.space/eidos-file"
import {
  GridCellKind,
  type CustomCell,
  type CustomRenderer,
  type ProvideEditorComponent,
} from "@glideapps/glide-data-grid"
import { Link2, Search, Unlink } from "lucide-react"

import { drawDrilldownCell } from "./cells/grid-cell-helper"
import { Button, Input } from "./ui/primitives"

import { useEidosFileRelationListbox } from "./eidos-file-relation-listbox"
import { EidosFileRelationOptionList } from "./eidos-file-relation-option-list"

interface EidosFileRelationCellData {
  readonly kind: "eidos-file-relation-cell"
  readonly values: EidosFileRelationValue[]
  readonly multiple: boolean
  readonly onSearch?: (query: string) => Promise<EidosFileRelationValue[]>
}

export type EidosFileRelationCell = CustomCell<EidosFileRelationCellData>

export const EidosFileRelationCellEditor: ProvideEditorComponent<
  EidosFileRelationCell
> = ({ value: cell, onChange, onFinishedEditing }) => {
  const [query, setQuery] = useState("")
  const [options, setOptions] = useState<EidosFileRelationValue[]>([])
  const [values, setValues] = useState(cell.data.values)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
                : "Unable to load records"
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
  const finish = () =>
    onFinishedEditing({
      ...cell,
      copyData:
        encodeEidosFileRelationIds(values.map((value) => value.id)) ?? "",
      data: { ...cell.data, values },
    })

  return (
    <div
      className="flex max-h-[390px] min-h-48 w-[340px] flex-col overflow-hidden border bg-popover shadow-lg"
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
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-2.5">
        <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Link records</span>
        {values.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7 gap-1 px-2 text-[11px] text-muted-foreground"
            onClick={() => update([])}
          >
            <Unlink className="h-3 w-3" />
            Clear
          </Button>
        ) : null}
      </div>
      <div className="relative border-b p-2">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          autoFocus
          role="combobox"
          aria-label="Search relation records"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={listboxId}
          aria-activedescendant={activeDescendantId}
          aria-busy={loading}
          className="h-8 pl-8 text-xs"
          placeholder="Search records"
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
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        <EidosFileRelationOptionList
          accessibleName="Relation records"
          activeOptionId={activeOptionId}
          availableValues={available}
          listboxId={listboxId}
          multiple={cell.data.multiple}
          optionId={optionId}
          query={query}
          selectedValues={values}
          onActiveOptionChange={setActiveOptionId}
          onToggle={toggle}
        />
        {!loading && !error && available.length === 0 ? (
          <p className="px-2 py-5 text-center text-xs text-muted-foreground">
            {values.length > 0 && !query
              ? "All loaded records are linked"
              : "No records found"}
          </p>
        ) : null}
        {loading ? (
          <p
            className="px-2 py-5 text-center text-xs text-muted-foreground"
            role="status"
          >
            Loading…
          </p>
        ) : null}
        {error ? (
          <p className="px-2 py-3 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex h-8 shrink-0 items-center justify-between border-t px-2.5 text-[10px] text-muted-foreground">
        <span>Arrow keys navigate · Enter selects</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px]"
          onClick={finish}
        >
          Done
        </Button>
      </div>
    </div>
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
    provideEditor: () => EidosFileRelationCellEditor,
    onPaste: () => undefined,
    onDelete: (cell) => ({
      ...cell,
      copyData: "",
      data: { ...cell.data, values: [] },
    }),
  }
