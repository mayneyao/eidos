import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

import { ExtensionSearch } from "./extension-search"
// import { ExtensionSortDropdown } from "./extension-sort-dropdown"
import { NewExtensionButton } from "./new-extension-button"

export const ExtensionSidebarHeader = () => {
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
