import { SearchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

import { CreateNodeTrigger } from "./create-node-trigger"
import { TreeSearch } from "./tree-search"
import { TreeSortDropdown } from "./tree-sort-dropdown"

interface TreeSidebarHeaderProps {
  showSearch: boolean
  onToggleSearch: () => void
  onExitSearch: () => void
  disableAdd?: boolean
}

export const TreeSidebarHeader = ({
  showSearch,
  onToggleSearch,
  onExitSearch,
  disableAdd = false,
}: TreeSidebarHeaderProps) => {
  return (
    <div className="px-1 flex-shrink-0">
      {/* Icon Buttons Row */}
      <div className="flex items-center justify-end gap-2">
        <div className="flex items-center gap-2">
          {/* Search Toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onToggleSearch}
          >
            <SearchIcon className="h-4 w-4" />
          </Button>
          {/* Sort Dropdown */}
          <TreeSortDropdown />

          {/* Create Node Button */}
          {!disableAdd && <CreateNodeTrigger />}
        </div>
      </div>

      {/* Conditional Search Input */}
      {showSearch && <TreeSearch onExit={onExitSearch} />}
    </div>
  )
}
