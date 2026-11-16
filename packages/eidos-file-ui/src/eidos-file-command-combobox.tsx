import type { ComponentPropsWithoutRef, ReactNode } from "react"

import { cn } from "./lib/cn"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/adaptive-popover"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandList,
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
  title,
  emptyText,
  filter,
  contentClassName,
  listClassName,
  side,
  sideOffset,
  collisionPadding,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactNode
  searchPlaceholder: string
  title?: string
  emptyText: string
  filter?: ComponentPropsWithoutRef<typeof Command>["filter"]
  contentClassName?: string
  listClassName?: string
  side?: ComponentPropsWithoutRef<typeof PopoverContent>["side"]
  sideOffset?: number
  collisionPadding?: ComponentPropsWithoutRef<
    typeof PopoverContent
  >["collisionPadding"]
  children: ReactNode
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        aria-label={title}
        className={cn("p-0", contentClassName)}
        align="start"
        side={side}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
      >
        <Command filter={filter} className="h-auto">
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
