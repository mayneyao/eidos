
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"

import { ItemIcon } from "../sidebar/item-tree"
import {
    CommandGroup,
    CommandItem,
    CommandSeparator,
    CommandShortcut,
} from "../ui/command"
import { useCMDKGoto, useCMDKStore } from "./hooks"

export const NodeCommandItems = () => {
  const { space } = useCurrentPathInfo()
  const { searchNodes } = useCMDKStore()
  const goto = useCMDKGoto()

  return (
    <>
      {Boolean(space && searchNodes.length) && (
        <>
          <CommandGroup heading="Nodes">
            {searchNodes.map((node) => (
              <CommandItem
                key={node.id}
                onSelect={goto(`/${space}/${node.id}`)}
                value={node.name}
              >
                <ItemIcon type={node.type} className="mr-2 h-4 w-4" />
                <span>{node.name}</span>
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
