import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  BaseFieldInfo,
  BaseRow,
  BaseSnapshot,
  BaseSqlPrimitive,
} from "@eidos.space/base"
import {
  AlertTriangle,
  LoaderCircle,
  Plus,
  RefreshCw,
  Table2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useSpaceBase } from "@/apps/web-app/hooks/use-space-base"
import { useSpaceFileChanges } from "@/apps/web-app/hooks/use-space-files"
import { Button } from "@/components/ui/button"

interface SpaceBaseEditorProps {
  filePath: string
}

interface SelectOption {
  id: string
  name: string
}

function visibleFields(fields: BaseFieldInfo[]): BaseFieldInfo[] {
  return fields.filter(
    (field) =>
      !field.isHidden &&
      (field.tableColumnName === "title" || field.valueKind === "source")
  )
}

function inputValue(value: BaseSqlPrimitive | undefined): string {
  if (value === null || value === undefined) return ""
  if (value instanceof Uint8Array) return `${value.byteLength} bytes`
  return String(value)
}

function selectOptions(field: BaseFieldInfo): SelectOption[] {
  const options = field.property?.options
  if (!Array.isArray(options)) return []
  return options.flatMap((option) => {
    if (
      typeof option === "object" &&
      option !== null &&
      "id" in option &&
      "name" in option &&
      typeof option.id === "string" &&
      typeof option.name === "string"
    ) {
      return [{ id: option.id, name: option.name }]
    }
    return []
  })
}

function normalizeEditedValue(
  field: BaseFieldInfo,
  value: string
): BaseSqlPrimitive {
  if (value === "") return null
  if (field.type === "number" || field.type === "rating") {
    const number = Number(value)
    return Number.isFinite(number) ? number : value
  }
  return value
}

export function SpaceBaseEditor({ filePath }: SpaceBaseEditorProps) {
  const { currentSpace } = useCurrentSpace()
  const { getSnapshot, insertRow, updateRow } = useSpaceBase(currentSpace?.id)
  const [snapshot, setSnapshot] = useState<BaseSnapshot | null>(null)
  const [activeTableId, setActiveTableId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [mutating, setMutating] = useState(false)
  const mutatingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)

  const applySnapshot = useCallback((next: BaseSnapshot) => {
    setSnapshot(next)
    setActiveTableId((current) => {
      if (current && next.tables.some(({ table }) => table.id === current)) {
        return current
      }
      return next.metadata.defaultTableId ?? next.tables.at(0)?.table.id ?? null
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      applySnapshot(await getSnapshot(filePath))
      setError(null)
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to open Base"
      )
    } finally {
      setLoading(false)
    }
  }, [applySnapshot, filePath, getSnapshot])

  useEffect(() => {
    void load()
  }, [load])

  useSpaceFileChanges(
    currentSpace?.id,
    useCallback(
      (event) => {
        if (event.path === filePath && !mutatingRef.current) void load()
      },
      [filePath, load]
    )
  )

  const activeTable = useMemo(
    () =>
      snapshot?.tables.find(({ table }) => table.id === activeTableId) ?? null,
    [activeTableId, snapshot?.tables]
  )
  const fields = useMemo(
    () => visibleFields(activeTable?.fields ?? []),
    [activeTable?.fields]
  )

  const mutate = useCallback(
    async (operation: () => Promise<BaseSnapshot>) => {
      mutatingRef.current = true
      setMutating(true)
      try {
        applySnapshot(await operation())
        setError(null)
      } catch (mutationError) {
        setError(
          mutationError instanceof Error
            ? mutationError.message
            : "Unable to update Base"
        )
      } finally {
        mutatingRef.current = false
        setMutating(false)
      }
    },
    [applySnapshot]
  )

  const createRow = () => {
    if (!activeTable) return
    void mutate(() =>
      insertRow(filePath, activeTable.table.id, { title: "Untitled" })
    )
  }

  const saveCell = (
    row: BaseRow,
    field: BaseFieldInfo,
    value: BaseSqlPrimitive
  ) => {
    if (!activeTable || !row._id || row[field.tableColumnName] === value) return
    void mutate(() =>
      updateRow(filePath, activeTable.table.id, String(row._id), {
        [field.tableColumnName]: value,
      })
    )
  }

  if (loading && !snapshot) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
        Opening Base…
      </div>
    )
  }

  if (!snapshot) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <AlertTriangle className="mb-3 h-5 w-5 text-destructive" />
        <p className="max-w-md text-sm text-foreground">
          {error ?? "This file is not a valid Eidos Base."}
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={load}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-10 shrink-0 items-end border-b bg-muted/15 px-2">
        <div className="flex min-w-0 flex-1 items-end gap-px overflow-x-auto">
          {snapshot.tables.map(({ table }) => (
            <button
              key={table.id}
              type="button"
              onClick={() => setActiveTableId(table.id)}
              className={cn(
                "relative flex h-9 max-w-56 shrink-0 items-center gap-1.5 px-3 text-[13px] text-muted-foreground outline-hidden hover:text-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
                activeTableId === table.id && "text-foreground"
              )}
            >
              <Table2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{table.name}</span>
              {activeTableId === table.id ? (
                <span className="absolute inset-x-2 bottom-0 h-0.5 bg-foreground/75" />
              ) : null}
            </button>
          ))}
        </div>
        <div className="flex h-9 shrink-0 items-center gap-1 pl-2">
          {mutating ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={!activeTable || mutating}
            onClick={createRow}
          >
            <Plus className="h-3.5 w-3.5" />
            New row
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Refresh Base"
            title="Refresh Base"
            disabled={loading || mutating}
            onClick={() => void load()}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", loading && "animate-spin")}
            />
          </Button>
        </div>
      </div>

      {error ? (
        <div className="shrink-0 border-b border-destructive/20 bg-destructive/5 px-3 py-1.5 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      {!activeTable ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-8 text-center text-sm text-muted-foreground">
          This Base has no tables yet.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-max border-separate border-spacing-0 text-[13px]">
            <thead className="sticky top-0 z-10 bg-background">
              <tr>
                <th className="h-8 w-10 border-b border-r bg-muted/20 px-2 text-center text-[11px] font-normal text-muted-foreground">
                  #
                </th>
                {fields.map((field) => (
                  <th
                    key={field.tableColumnName}
                    className="h-8 min-w-44 border-b border-r bg-muted/20 px-2 text-left text-[12px] font-medium text-muted-foreground last:border-r-0"
                  >
                    {field.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeTable.rows.map((row, index) => (
                <tr key={String(row._id)} className="group/row">
                  <td className="h-8 border-b border-r bg-muted/10 px-2 text-center text-[11px] tabular-nums text-muted-foreground">
                    {index + 1}
                  </td>
                  {fields.map((field) => (
                    <td
                      key={field.tableColumnName}
                      className="h-8 border-b border-r p-0 last:border-r-0 focus-within:ring-1 focus-within:ring-inset focus-within:ring-ring"
                    >
                      <BaseCellEditor
                        field={field}
                        row={row}
                        disabled={mutating}
                        onCommit={(value) => saveCell(row, field, value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {activeTable.rows.length === 0 ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 border-b px-4 py-5 text-left text-sm text-muted-foreground hover:bg-muted/20 hover:text-foreground"
              onClick={createRow}
            >
              <Plus className="h-4 w-4" />
              Create the first row
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

function BaseCellEditor({
  field,
  row,
  disabled,
  onCommit,
}: {
  field: BaseFieldInfo
  row: BaseRow
  disabled: boolean
  onCommit: (value: BaseSqlPrimitive) => void
}) {
  const value = row[field.tableColumnName]
  if (field.type === "checkbox") {
    return (
      <label className="flex h-full items-center px-2">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-input accent-primary"
          checked={value === 1 || value === "1"}
          disabled={disabled}
          onChange={(event) => onCommit(event.target.checked ? 1 : 0)}
        />
      </label>
    )
  }

  const options = selectOptions(field)
  if (field.type === "select" && options.length > 0) {
    return (
      <select
        className="h-full w-full bg-transparent px-2 outline-hidden disabled:opacity-50"
        value={inputValue(value)}
        disabled={disabled}
        onChange={(event) => onCommit(event.target.value || null)}
      >
        <option value="" />
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    )
  }

  return (
    <input
      key={`${String(row._id)}:${field.tableColumnName}:${inputValue(value)}`}
      type={
        field.type === "number" || field.type === "rating" ? "number" : "text"
      }
      className="h-full w-full bg-transparent px-2 outline-hidden placeholder:text-muted-foreground/50 disabled:opacity-50"
      defaultValue={inputValue(value)}
      disabled={disabled}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
      }}
      onBlur={(event) => {
        const next = normalizeEditedValue(field, event.currentTarget.value)
        if (next !== value) onCommit(next)
      }}
    />
  )
}
