import type { IExtension } from "@/packages/core/meta-table/extension"
import {
  ExternalLinkIcon,
  MoreVerticalIcon,
  PlusIcon,
  RotateCcwIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { cn } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"

import { IconMap } from "../page"

interface ExtensionCardProps {
  script: IExtension
  space: string
  onDelete: (id: string) => void
  onToggleEnabled: (script: IExtension, checked: boolean) => void
  onAddToSidebar?: (blockId: string) => void
  onOpenStandalone?: (blockId: string) => void
  showReload?: boolean
  onReload?: () => void
}

export const ExtensionCard = ({
  script,
  space,
  onDelete,
  onToggleEnabled,
  onAddToSidebar,
  onOpenStandalone,
  showReload,
  onReload,
}: ExtensionCardProps) => {
  const { t } = useTranslation()
  const IconFromMap = IconMap[script.type]
  const iconIsDataUri = script.icon && script.icon.startsWith("data:image")

  const isEnabledMicroBlock = script.type === "block" && script.enabled
  const hasMenuItems =
    isEnabledMicroBlock && (onAddToSidebar || onOpenStandalone)

  return (
    <div className="group relative overflow-hidden rounded-lg border bg-card text-card-foreground shadow transition-all hover:shadow-lg flex flex-col min-h-[160px]">
      {/* Top-right menu */}
      {Boolean(hasMenuItems) && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <MoreVerticalIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isEnabledMicroBlock && onAddToSidebar && (
                <DropdownMenuItem onClick={() => onAddToSidebar(script.id)}>
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Add to Sidebar
                </DropdownMenuItem>
              )}
              {isEnabledMicroBlock && onOpenStandalone && (
                <DropdownMenuItem onClick={() => onOpenStandalone(script.id)}>
                  <ExternalLinkIcon className="h-4 w-4 mr-2" />
                  Open Standalone
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div className="flex flex-col space-y-1.5 p-4">
        <div className="flex items-start gap-3">
          {iconIsDataUri ? (
            <img
              src={script.icon}
              alt={script.name}
              className="h-8 w-8 shrink-0 opacity-70 mt-2 border rounded-md"
            />
          ) : (
            <IconFromMap className="h-8 w-8 shrink-0 opacity-70 mt-1" />
          )}
          <div>
            <h3 className="text-lg font-semibold tracking-tight">
              {script.name}{" "}
              <span className="text-sm text-muted-foreground">
                {t("extension.version", { version: script.version })}
              </span>
            </h3>
            <p className="text-sm text-muted-foreground">
              {script.description}
            </p>
          </div>
        </div>
      </div>

      <div
        className={cn("flex items-center justify-between p-4 pt-0 mt-auto", {
          "opacity-0 pointer-events-none": ["block", "app"].includes(
            script.type
          ),
        })}
      >
        <div className="flex items-center gap-2">
          <Link to={`/${space}/extensions/${script.id}`}>
            <Button size="xs" variant="outline">
              {t("extension.details")}
            </Button>
          </Link>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="xs" variant="ghost">
                {t("common.delete")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("extension.deleteExtensionConfirm")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("extension.deleteExtensionDescription")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(script.id)}>
                  {t("common.continue")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            checked={script.enabled}
            onCheckedChange={(checked) => onToggleEnabled(script, checked)}
          />
          {showReload && (
            <Button
              onClick={onReload}
              variant="ghost"
              size="icon"
              title={t("extension.reloadLocalScript")}
            >
              <RotateCcwIcon className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
