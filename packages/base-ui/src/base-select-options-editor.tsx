import { useEffect, useMemo, useRef, useState } from "react"
import type { BaseFieldInfo } from "@eidos.space/base"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Plus, Trash2 } from "lucide-react"
import { useBaseUI } from "./context"
import { cn } from "./lib/cn"
import { Button, Input } from "./ui/primitives"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/primitives"

import {
  BASE_OPTION_COLORS,
  baseOptionColor,
  baseSelectOptions,
  type BaseSelectOption,
} from "./base-field-properties"

function optionId(): string {
  return `option_${globalThis.crypto.randomUUID().replace(/-/g, "")}`
}

function OptionRow({
  option,
  disabled,
  onRename,
  onColor,
  onDelete,
}: {
  option: BaseSelectOption
  disabled: boolean
  onRename: (name: string) => boolean
  onColor: (color: string) => void
  onDelete: () => void
}) {
  const { themeName: theme } = useBaseUI()
  const [name, setName] = useState(option.name)
  const skipNameCommitRef = useRef(false)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: option.id, disabled })

  useEffect(() => setName(option.name), [option.name])

  const commitName = () => {
    if (skipNameCommitRef.current) {
      skipNameCommitRef.current = false
      return
    }
    const next = name.trim()
    if (next && next !== option.name && onRename(next)) return
    setName(option.name)
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group/option flex min-h-8 items-center gap-1 border-b px-1.5 last:border-b-0",
        isDragging && "relative z-10 bg-background opacity-70 shadow-sm"
      )}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        className="flex h-6 w-5 shrink-0 cursor-grab items-center justify-center rounded-[3px] text-muted-foreground/50 hover:bg-accent hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
        aria-label={`Reorder ${option.name}`}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3 w-3" />
      </button>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-4 w-4 shrink-0 rounded-[3px] ring-1 ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ backgroundColor: baseOptionColor(option.color, theme) }}
            aria-label={`Change ${option.name} color`}
            disabled={disabled}
          />
        </PopoverTrigger>
        <PopoverContent align="start" side="right" className="w-44 p-2">
          <p className="mb-2 text-[11px] font-medium text-muted-foreground">
            Color
          </p>
          <div className="grid grid-cols-6 gap-1.5">
            {BASE_OPTION_COLORS.map((color) => (
              <button
                key={color.name}
                type="button"
                className={cn(
                  "h-5 w-5 rounded-[3px] ring-1 ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  option.color === color.name && "ring-2 ring-foreground"
                )}
                style={{ backgroundColor: color[theme] }}
                aria-label={color.name}
                onClick={() => onColor(color.name)}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <Input
        value={name}
        disabled={disabled}
        className="h-7 min-w-0 flex-1 border-transparent bg-transparent px-1.5 text-xs shadow-none hover:border-border focus-visible:border-ring"
        aria-label={`${option.name} option name`}
        onChange={(event) => setName(event.target.value)}
        onBlur={commitName}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
          if (event.key === "Escape") {
            skipNameCommitRef.current = true
            setName(option.name)
            event.currentTarget.blur()
          }
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 group-hover/option:opacity-100 focus-visible:opacity-100"
        aria-label={`Delete ${option.name}`}
        disabled={disabled}
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function sameOptionName(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: "base" }) === 0
}

export function BaseOptionsEditor({
  options: sourceOptions,
  disabled,
  onChange,
  className,
}: {
  options: BaseSelectOption[]
  disabled: boolean
  onChange: (options: BaseSelectOption[]) => Promise<void> | void
  className?: string
}) {
  const [options, setOptions] = useState(sourceOptions)
  const [newName, setNewName] = useState("")
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => setOptions(sourceOptions), [sourceOptions])

  const commit = (next: BaseSelectOption[]) => {
    const previous = options
    setOptions(next)
    void Promise.resolve()
      .then(() => onChange(next))
      .catch(() =>
        setOptions((current) => (current === next ? previous : current))
      )
  }

  const addOption = () => {
    const name = newName.trim()
    if (!name || options.some((option) => sameOptionName(option.name, name))) {
      return
    }
    commit([
      ...options,
      {
        id: optionId(),
        name,
        color:
          BASE_OPTION_COLORS[options.length % BASE_OPTION_COLORS.length].name,
      },
    ])
    setNewName("")
  }
  const newNameUnavailable = options.some((option) =>
    sameOptionName(option.name, newName.trim())
  )

  const dragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return
    const from = options.findIndex((option) => option.id === event.active.id)
    const to = options.findIndex((option) => option.id === event.over?.id)
    if (from >= 0 && to >= 0) commit(arrayMove(options, from, to))
  }

  return (
    <section className={cn("grid gap-2 border-t pt-3", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium">Options</h3>
        <span className="text-[11px] text-muted-foreground">
          {options.length}
        </span>
      </div>
      <div className="overflow-hidden rounded-md border">
        {options.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={dragEnd}
          >
            <SortableContext
              items={options.map((option) => option.id)}
              strategy={verticalListSortingStrategy}
            >
              {options.map((option) => (
                <OptionRow
                  key={option.id}
                  option={option}
                  disabled={disabled}
                  onRename={(name) => {
                    if (
                      options.some(
                        (candidate) =>
                          candidate.id !== option.id &&
                          sameOptionName(candidate.name, name)
                      )
                    ) {
                      return false
                    }
                    commit(
                      options.map((candidate) =>
                        candidate.id === option.id
                          ? { ...candidate, name }
                          : candidate
                      )
                    )
                    return true
                  }}
                  onColor={(color) =>
                    commit(
                      options.map((candidate) =>
                        candidate.id === option.id
                          ? { ...candidate, color }
                          : candidate
                      )
                    )
                  }
                  onDelete={() =>
                    commit(
                      options.filter((candidate) => candidate.id !== option.id)
                    )
                  }
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          <p className="px-3 py-5 text-center text-xs text-muted-foreground">
            Add the first option below.
          </p>
        )}
        <div className="flex items-center gap-1 border-t p-1.5">
          <Input
            value={newName}
            disabled={disabled}
            className={cn(
              "h-7 flex-1 text-xs",
              newNameUnavailable && "border-destructive"
            )}
            placeholder="New option"
            aria-label="New option name"
            aria-invalid={newNameUnavailable || undefined}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                addOption()
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Add option"
            disabled={disabled || !newName.trim() || newNameUnavailable}
            onClick={addOption}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        {newNameUnavailable ? (
          <p
            className="border-t px-2.5 py-1.5 text-[11px] text-destructive"
            role="status"
          >
            Option names must be unique.
          </p>
        ) : null}
      </div>
    </section>
  )
}

export function BaseSelectOptionsEditor({
  field,
  disabled,
  onChange,
}: {
  field: BaseFieldInfo
  disabled: boolean
  onChange: (property: Record<string, unknown>) => Promise<void> | void
}) {
  const options = useMemo(() => baseSelectOptions(field), [field])
  return (
    <BaseOptionsEditor
      options={options}
      disabled={disabled}
      onChange={(next) =>
        onChange({ ...(field.property ?? {}), options: next })
      }
    />
  )
}
