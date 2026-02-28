import { Database } from "lucide-react"

import { isDesktopMode } from "@/lib/env"
import { useSpace } from "@/apps/web-app/hooks/use-space"

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

  const handleSpaceSelect = async (spaceId: string) => {
    if (isDesktopMode && typeof window !== "undefined" && window.eidos) {
      // Desktop mode: use Electron IPC to switch workspace
      try {
        const result = await window.eidos.invoke("switch-space", spaceId)
        if (result.success) {
          // Workspace switched successfully, Electron will automatically reload to new subdomain
        } else {
          console.error("Failed to switch space:", result.error)
        }
      } catch (error) {
        console.error("Error switching space:", error)
      }
    } else {
      // Web mode: use route navigation
      goto(`/`)()
    }
  }

  return (
    <>
      {Boolean(spaceList.length) && (
        <>
          <CommandGroup heading="Spaces">
            {spaceList.map((space) => (
              <CommandItem
                key={space.id}
                onSelect={() => handleSpaceSelect(space.id)}
                value={space.id}
              >
                <Database className="mr-2 h-4 w-4" />
                <span>{space.name}</span>
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
