import type { IExtension } from "@/packages/core/meta-table/extension"
import {
  ExternalLinkIcon,
  HeartIcon,
  MoreVerticalIcon,
  PanelRightIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"

import { IconMap } from "../page"

interface ExtensionListItemProps {
  script: IExtension
  space: string
  onDelete: (id: string) => void
  onToggleEnabled: (script: IExtension, enabled: boolean) => void
  onAddToSidebar: (id: string) => void
  onOpenStandalone: (id: string) => void
  onToggleFavorite?: (script: IExtension) => void
  isFavorite?: boolean
  showReload?: boolean
  onReload?: () => void
}

export const ExtensionListItem = ({
  script,
  space,
  onDelete,
  onToggleEnabled,
  onAddToSidebar,
  onOpenStandalone,
  onToggleFavorite,
  isFavorite,
  showReload,
  onReload,
}: ExtensionListItemProps) => {
  // Use meta.type for new architecture, fallback to script.type for compatibility
  const iconType = script.meta?.type || script.type
  const Icon = IconMap[iconType] || IconMap.script
  const iconIsDataUri = script.icon && script.icon.startsWith("data:image")

  // Helper function to check if this is a block extension
  const isBlockExtension =
    script.type === "block" ||
    script.meta?.type === "tableView" ||
    script.meta?.type === "extNode"

  return (
    <Link
      to={`/${space}/extensions/${script.id}`}
      className="block p-4 border border-border/60 rounded-lg hover:border-border hover:shadow-sm transition-all bg-card"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {iconIsDataUri ? (
            <img
              src={script.icon}
              alt={script.name}
              className="h-10 w-10 rounded-md border flex-shrink-0"
            />
          ) : (
            <div className="h-10 w-10 rounded-md border bg-muted/50 flex items-center justify-center flex-shrink-0">
              <Icon size={20} className="text-muted-foreground" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium truncate">{script.name}</h3>
              {isBlockExtension && isFavorite && (
                <HeartIcon
                  size={14}
                  className="text-red-500 fill-current flex-shrink-0"
                />
              )}
            </div>

            <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
              {script.description || "No description available"}
            </p>

            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs px-2 py-0.5">
                {script.meta?.type || script.type}
              </Badge>
              <Badge variant="outline" className="text-xs px-2 py-0.5">
                v{script.version}
              </Badge>
            </div>
          </div>
        </div>

        <div
          className="flex items-center gap-2 flex-shrink-0 ml-4"
          onClick={(e) => e.preventDefault()}
        >
          {showReload && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onReload}
              title="Reload extension"
            >
              <RefreshCwIcon size={16} />
            </Button>
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {script.enabled ? "Enabled" : "Disabled"}
            </span>
            <Switch
              checked={script.enabled}
              onCheckedChange={(checked) => onToggleEnabled(script, checked)}
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVerticalIcon size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {isBlockExtension && (
                <>
                  {onToggleFavorite && (
                    <DropdownMenuItem onClick={() => onToggleFavorite(script)}>
                      <HeartIcon
                        size={16}
                        className={`mr-2 ${isFavorite ? "text-red-500 fill-current" : ""}`}
                      />
                      {isFavorite
                        ? "Remove from favorites"
                        : "Add to favorites"}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => onAddToSidebar(script.id)}>
                    <PanelRightIcon size={16} className="mr-2" />
                    Add to sidebar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onOpenStandalone(script.id)}>
                    <ExternalLinkIcon size={16} className="mr-2" />
                    Open standalone
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(script.id)}
              >
                <Trash2Icon size={16} className="mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Link>
  )
}
