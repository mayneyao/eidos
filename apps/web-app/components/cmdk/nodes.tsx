import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"

import { ExtNodeBadge } from "../ext-node-badge"
import { ItemIcon } from "../sidebar/nodes"
import { Badge } from "../ui/badge"
import {
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "../ui/command"
import { useCMDKGoto, useCMDKStore, useInput } from "./hooks"

export const NodeCommandItems = () => {
  const { space } = useCurrentPathInfo()
  const { searchNodes } = useCMDKStore()
  const { input } = useInput()
  const goto = useCMDKGoto()
  const handleGoto = (id: string) => {
    if (id.length === 10) {
      return goto(`/everyday/${id}`)
    }
    return goto(`/${id}`)
  }
  return (
    <>
      {Boolean(space && searchNodes.length) && (
        <>
          <CommandGroup heading="Nodes">
            {searchNodes
              .filter((node) => node.mode === "node")
              .map((node) => (
                <CommandItem
                  key={node.id}
                  onSelect={handleGoto(node.id)}
                  value={`${input} - ${node.id} - ${node.mode}`}
                >
                  <ItemIcon type={node.type} className="mr-2 h-4 w-4" />
                  <span>{node.name}</span>
                  <ExtNodeBadge type={node.type} />
                  <CommandShortcut>Jump to</CommandShortcut>
                </CommandItem>
              ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Search">
            {searchNodes
              .filter((node) => node.mode === "fts")
              .map((node) => (
                <CommandItem
                  key={node.id}
                  onSelect={handleGoto(node.id)}
                  value={`${input} - ${node.id} - ${node.mode}`}
                >
                  <div className="flex flex-col">
                    <div className="flex">
                      <ItemIcon type={node.type} className="mr-2 h-4 w-4" />
                      <span>{node.name}</span>
                    </div>
                    {node.result && (
                      <div
                        className="fts-result ml-7"
                        dangerouslySetInnerHTML={{
                          __html: node.result,
                        }}
                      ></div>
                    )}
                  </div>
                  {/* <CommandShortcut>Jump to</CommandShortcut> */}
                </CommandItem>
              ))}
          </CommandGroup>
        </>
      )}
    </>
  )
}
