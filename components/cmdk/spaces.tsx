import { Database } from "lucide-react"

import { useSpace } from "@/hooks/use-space"

import {
    CommandGroup,
    CommandItem,
    CommandSeparator,
    CommandShortcut,
} from "../ui/command"
import { useCMDKGoto } from "./hooks"

export const SpaceCommandItems = () => {
  const { spaceList } = useSpace()
  const goto = useCMDKGoto()

  return (
    <>
      {Boolean(spaceList.length) && (
        <>
          <CommandGroup heading="Spaces">
            {spaceList.map((space) => (
              <CommandItem
                key={space}
                onSelect={goto(`/${space}`)}
                value={space}
              >
                <Database className="mr-2 h-4 w-4" />
                <span>{space}</span>
                <CommandShortcut>Jump to</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
        </>
      )}
    </>
  )
}
