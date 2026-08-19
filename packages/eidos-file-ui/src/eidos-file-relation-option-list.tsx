import type { EidosFileRelationValue } from "@eidos.space/eidos-file"
import { Check, ExternalLink } from "lucide-react"

import { useEidosFileUI } from "./context"
import { cn } from "./lib/cn"

export function EidosFileRelationOptionList({
  accessibleName,
  activeOptionId,
  availableValues,
  disabled = false,
  listboxId,
  multiple,
  optionId,
  query,
  selectedValues,
  targetTableId,
  onActiveOptionChange,
  onOpenRecord,
  onToggle,
}: {
  accessibleName: string
  activeOptionId: string | null
  availableValues: EidosFileRelationValue[]
  disabled?: boolean
  listboxId: string
  multiple: boolean
  optionId: (index: number) => string
  query: string
  selectedValues: EidosFileRelationValue[]
  targetTableId?: string
  onActiveOptionChange: (optionId: string) => void
  onOpenRecord?: () => void
  onToggle: (option: EidosFileRelationValue) => void
}) {
  const { openRelationRecord, translate: t } = useEidosFileUI()
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
          aria-label={t("Selected records, {count}", {
            count: selectedValues.length,
          })}
        >
          <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("Selected · {count}", { count: selectedValues.length })}
          </p>
          {selectedValues.map((option, index) => (
            <div
              key={option.id}
              className={cn(
                "group flex h-8 w-full items-center rounded-sm text-xs hover:bg-accent",
                activeOptionId === option.id && "bg-accent"
              )}
              onMouseEnter={() => onActiveOptionChange(option.id)}
            >
              <button
                id={optionId(index)}
                type="button"
                role="option"
                aria-selected={true}
                tabIndex={-1}
                className="flex min-w-0 flex-1 items-center gap-2 self-stretch rounded-sm px-2 text-left disabled:opacity-50"
                disabled={disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onToggle(option)}
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-[3px] bg-foreground text-background">
                  <Check className="h-3 w-3" />
                </span>
                <span className="min-w-0 flex-1 truncate">{option.title}</span>
              </button>
              {openRelationRecord && targetTableId ? (
                <button
                  type="button"
                  className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label={t("Open linked record {title}", {
                    title: option.title,
                  })}
                  disabled={disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    void openRelationRecord({
                      tableId: targetTableId,
                      rowId: option.id,
                      title: option.title,
                    })
                    onOpenRecord?.()
                  }}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <div role="group" aria-label={query ? t("Results") : t("Records")}>
        <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {query ? t("Results") : t("Records")}
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
