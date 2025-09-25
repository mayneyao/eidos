import { CreateNodeTrigger } from "./create-node-trigger"
import { TreeSearch } from "./tree-search"
import { TreeSortDropdown } from "./tree-sort-dropdown"

interface TreeSidebarHeaderProps {
  disableAdd?: boolean
}

export const TreeSidebarHeader = ({
  disableAdd = false,
}: TreeSidebarHeaderProps) => {
  return (
    <div className="px-1 flex-shrink-0">
      {/* Icon Buttons Row with Search */}
      <div className="flex items-center justify-end gap-2">
        <div className="flex items-center gap-1">
          {/* Search Component */}
          <TreeSearch />

          {/* Sort Dropdown */}
          <TreeSortDropdown />

          {/* Create Node Button */}
          {!disableAdd && <CreateNodeTrigger />}
        </div>
      </div>
    </div>
  )
}
