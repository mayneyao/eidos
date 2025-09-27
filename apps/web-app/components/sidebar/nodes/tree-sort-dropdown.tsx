import { CheckIcon, ArrowUpDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useTreeSidebarStore } from "./tree-sidebar-store"
import type { TreeSortField, TreeSortOrder } from "./tree-sidebar-store"

export const TreeSortDropdown = () => {
  const { sortField, sortOrder, setSort } = useTreeSidebarStore()

  const handleSortChange = (
    field: TreeSortField,
    order: TreeSortOrder
  ) => {
    setSort(field, order)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <ArrowUpDownIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem
          onClick={() => handleSortChange("name", "ASC")}
          className={cn(
            sortField === "name" && sortOrder === "ASC" && "bg-accent"
          )}
        >
          <span className="flex-1 whitespace-nowrap">Name A-Z</span>
          {sortField === "name" && sortOrder === "ASC" && (
            <CheckIcon className="h-4 w-4" />
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleSortChange("name", "DESC")}
          className={cn(
            sortField === "name" && sortOrder === "DESC" && "bg-accent"
          )}
        >
          <span className="flex-1 whitespace-nowrap">Name Z-A</span>
          {sortField === "name" && sortOrder === "DESC" && (
            <CheckIcon className="h-4 w-4" />
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleSortChange("type", "ASC")}
          className={cn(
            sortField === "type" && sortOrder === "ASC" && "bg-accent"
          )}
        >
          <span className="flex-1 whitespace-nowrap">Type A-Z</span>
          {sortField === "type" && sortOrder === "ASC" && (
            <CheckIcon className="h-4 w-4" />
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleSortChange("type", "DESC")}
          className={cn(
            sortField === "type" && sortOrder === "DESC" && "bg-accent"
          )}
        >
          <span className="flex-1 whitespace-nowrap">Type Z-A</span>
          {sortField === "type" && sortOrder === "DESC" && (
            <CheckIcon className="h-4 w-4" />
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleSortChange("created_at", "DESC")}
          className={cn(
            sortField === "created_at" &&
              sortOrder === "DESC" &&
              "bg-accent"
          )}
        >
          <span className="flex-1 whitespace-nowrap">Newest First</span>
          {sortField === "created_at" && sortOrder === "DESC" && (
            <CheckIcon className="h-4 w-4" />
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleSortChange("created_at", "ASC")}
          className={cn(
            sortField === "created_at" &&
              sortOrder === "ASC" &&
              "bg-accent"
          )}
        >
          <span className="flex-1 whitespace-nowrap">Oldest First</span>
          {sortField === "created_at" && sortOrder === "ASC" && (
            <CheckIcon className="h-4 w-4" />
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
