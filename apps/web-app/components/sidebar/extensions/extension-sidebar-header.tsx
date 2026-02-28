"use client"

import { FolderTree, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useExtensionStore } from "@/apps/web-app/store/extension-store"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { ExtensionSearch } from "./extension-search"
// import { ExtensionSortDropdown } from "./extension-sort-dropdown"
import { NewExtensionButton } from "./new-extension-button"

export const ExtensionSidebarHeader = () => {
  const { viewPrefixesAsDirectories, setViewPrefixesAsDirectories } =
    useExtensionStore()

  return (
    <div className="px-1 flex-shrink-0">
      {/* Search and Action Buttons Row */}
      <div className="flex items-center gap-2 ml-3">
        {/* Search Component - takes full width */}
        <div className="flex-1">
          <ExtensionSearch />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          {/* View Mode Toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={viewPrefixesAsDirectories ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() =>
                    setViewPrefixesAsDirectories(!viewPrefixesAsDirectories)
                  }
                >
                  <FolderTree className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {viewPrefixesAsDirectories
                    ? "View as directories"
                    : "View as flat list"}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Sort Dropdown */}
          {/* <ExtensionSortDropdown /> */}

          {/* Create Extension Button */}
          <NewExtensionButton
            trigger={
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <PlusIcon className="h-4 w-4" />
              </Button>
            }
          />
        </div>
      </div>
    </div>
  )
}
