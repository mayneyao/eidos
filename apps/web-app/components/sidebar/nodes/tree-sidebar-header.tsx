import { CreateNodeTrigger } from "./create-node-trigger"
import { TreeSearch } from "./tree-search"

// import { TreeSortDropdown } from "./tree-sort-dropdown"

interface TreeSidebarHeaderProps {
  disableAdd?: boolean
}

export const TreeSidebarHeader = ({
  disableAdd = false,
}: TreeSidebarHeaderProps) => {
  return (
    <div className="px-1 flex-shrink-0">
      {/* Search and Action Buttons Row */}
      <div className="flex items-center gap-2 ml-3">
        {/* Search Component - takes full width */}
        <div className="flex-1">
          <TreeSearch />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          {/* Sort Dropdown */}
          {/* <TreeSortDropdown /> */}

          {/* Create Node Button */}
          {!disableAdd && <CreateNodeTrigger />}
        </div>
      </div>
    </div>
  )
}
