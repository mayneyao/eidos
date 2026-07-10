import { Database } from "lucide-react"

import { isDesktopMode } from "@/lib/env"
import { flushPendingFileWrites } from "@/apps/web-app/components/file-space/pending-writes"
import { useSpace } from "@/apps/web-app/hooks/use-space"
import { useToast } from "@/components/ui/use-toast"

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
  const { toast } = useToast()

  const handleSpaceSelect = async (spaceId: string) => {
    if (!(await flushPendingFileWrites())) {
      toast({
        title: "Unable to switch Spaces",
        description:
          "Eidos could not save the current file. Resolve the error and try again.",
        variant: "destructive",
      })
      return
    }
    if (isDesktopMode && typeof window !== "undefined" && window.eidos) {
      // Desktop mode: use Electron IPC to switch Space
      try {
        const result = await window.eidos.spaceMgmt.switchSpace(spaceId)
        if (!result.success) {
          throw new Error(result.error || "Unable to open this Space")
        }
        // Space switched successfully; Electron reloads the matching subdomain.
      } catch (error) {
        console.error("Error switching space:", error)
        toast({
          title: "Unable to open Space",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        })
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
