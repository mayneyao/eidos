import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { ScrollArea } from "@/components/ui/scroll-area"

export enum AIActionEnum {
  INSERT_BELOW = "insert_below",
  REPLACE = "replace",
  TRY_AGAIN = "try_again",
}

const AIActionDisplay = Object.values(AIActionEnum).reduce(
  (acc, key) => {
    acc[key] = key
      .split("_")
      .join(" ")
      .replace(/\b\w/g, (l) => l.toUpperCase())
    return acc
  },
  {} as Record<string, string>
)

interface AIActionListProps {
  onSelect: (action: AIActionEnum) => void
}

export function AIActionList({ onSelect }: AIActionListProps) {
  return (
    <Command className="mt-1 w-[200px] rounded-md border shadow-md">
      <CommandInput placeholder="Search Action..." autoFocus />
      <ScrollArea>
        <CommandList>
          <CommandEmpty>No Action found.</CommandEmpty>
          <CommandGroup>
            {Object.values(AIActionEnum).map((action) => (
              <CommandItem
                key={action}
                value={action}
                onSelect={() => onSelect(action)}
              >
                {AIActionDisplay[action]}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </ScrollArea>
    </Command>
  )
}
