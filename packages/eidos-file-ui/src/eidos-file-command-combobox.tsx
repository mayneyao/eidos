import type { ComponentPropsWithoutRef, ReactNode } from "react"

import { cn } from "./lib/cn"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/primitives"

/**
 * Shared searchable dropdown shell: a Popover hosting a cmdk Command list
 * with keyboard navigation (arrows/Enter), type-to-filter, and scrolling.
 * Consumers own the trigger and the CommandGroup/CommandItem content.
 */
export function EidosFileCommandCombobox({
  open,
  onOpenChange,
  trigger,
  searchPlaceholder,
  emptyText,
  filter,
  contentClassName,
  listClassName,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactNode
  searchPlaceholder: string
  emptyText: string
  filter?: ComponentPropsWithoutRef<typeof Command>["filter"]
  contentClassName?: string
  listClassName?: string
  children: ReactNode
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className={cn("p-0", contentClassName)} align="start">
        <Command filter={filter}>
          <CommandInput
            autoFocus
            placeholder={searchPlaceholder}
            className="h-8 py-2 text-xs"
          />
          <CommandList className={listClassName}>
            <CommandEmpty className="py-3 text-xs">{emptyText}</CommandEmpty>
            {children}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
