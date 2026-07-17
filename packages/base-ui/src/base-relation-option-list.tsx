import type { BaseRelationValue } from "@eidos.space/base"
import { Check } from "lucide-react"

import { cn } from "./lib/cn"

export function BaseRelationOptionList({
  accessibleName,
  activeOptionId,
  availableValues,
  disabled = false,
  listboxId,
  multiple,
  optionId,
  query,
  selectedValues,
  onActiveOptionChange,
  onToggle,
}: {
  accessibleName: string
  activeOptionId: string | null
  availableValues: BaseRelationValue[]
  disabled?: boolean
  listboxId: string
  multiple: boolean
  optionId: (index: number) => string
  query: string
  selectedValues: BaseRelationValue[]
  onActiveOptionChange: (optionId: string) => void
  onToggle: (option: BaseRelationValue) => void
}) {
  return (
    <div
      id={listboxId}
      role="listbox"
      aria-label={accessibleName}
      aria-multiselectable={multiple}
    >
      {selectedValues.length > 0 ? (
        <div
          className="mb-1.5"
          role="group"
          aria-label={`Selected records, ${selectedValues.length}`}
        >
          <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Selected · {selectedValues.length}
          </p>
          {selectedValues.map((option, index) => (
            <button
              key={option.id}
              id={optionId(index)}
              type="button"
              role="option"
              aria-selected={true}
              tabIndex={-1}
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs hover:bg-accent disabled:opacity-50",
                activeOptionId === option.id && "bg-accent"
              )}
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => onActiveOptionChange(option.id)}
              onClick={() => onToggle(option)}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-[3px] bg-foreground text-background">
                <Check className="h-3 w-3" />
              </span>
              <span className="min-w-0 flex-1 truncate">{option.title}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div role="group" aria-label={query ? "Results" : "Records"}>
        <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {query ? "Results" : "Records"}
        </p>
        {availableValues.map((option, index) => (
          <button
            key={option.id}
            id={optionId(selectedValues.length + index)}
            type="button"
            role="option"
            aria-selected={false}
            tabIndex={-1}
            className={cn(
              "flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs hover:bg-accent disabled:opacity-50",
              activeOptionId === option.id && "bg-accent"
            )}
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => onActiveOptionChange(option.id)}
            onClick={() => onToggle(option)}
          >
            <span className="h-4 w-4 rounded-[3px] border" />
            <span className="min-w-0 flex-1 truncate">{option.title}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
