import { forwardRef } from "react"
import { SearchIcon, XIcon } from "lucide-react"

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  onClear: () => void
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ value, onChange, onClear }, ref) => {
    return (
      <div className="relative shrink-0 w-52">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
        <input
          ref={ref}
          type="text"
          placeholder="Search..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              if (value) {
                onClear()
              } else {
                ;(
                  ref as React.RefObject<HTMLInputElement | null>
                ).current?.blur()
              }
            }
          }}
          className="w-full pl-8 pr-16 h-7 text-sm bg-muted/50 hover:bg-muted focus:bg-background rounded-md border border-transparent focus:border-border focus:ring-0 focus:outline-none transition-all placeholder:text-muted-foreground/50"
        />
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {!value ? (
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-sans font-medium text-muted-foreground/60 bg-muted rounded border border-border/50">
              <span className="text-[9px]">Ctrl</span>
              <span>F</span>
            </kbd>
          ) : (
            <button
              onClick={onClear}
              className="p-0.5 hover:bg-muted-foreground/10 rounded transition-colors"
            >
              <XIcon className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>
    )
  }
)
SearchInput.displayName = "SearchInput"
