import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

import { ExtensionSearch } from "./extension-search"
import { ExtensionSortDropdown } from "./extension-sort-dropdown"
import { NewExtensionButton } from "./new-extension-button"

interface ExtensionSidebarHeaderProps {
  showSearch: boolean
  onToggleSearch: () => void
  onExitSearch: () => void
}

export const ExtensionSidebarHeader = ({
  showSearch,
  onToggleSearch,
  onExitSearch,
}: ExtensionSidebarHeaderProps) => {
  return (
    <div className="px-1 flex-shrink-0">
      {/* Icon Buttons Row with Search */}
      <div className="flex items-center justify-end gap-2">
        <div className="flex items-center gap-1 h-8">
          {/* Search Component */}
          <ExtensionSearch
            showSearch={showSearch}
            onToggleSearch={onToggleSearch}
            onExitSearch={onExitSearch}
          />

          {/* Sort Dropdown */}
          <ExtensionSortDropdown />

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
