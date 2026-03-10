import {
  ChevronDownIcon,
  CodeIcon,
  DatabaseIcon,
  ExternalLinkIcon,
  FileTypeIcon,
  GridIcon,
  PuzzleIcon,
  ToyBrickIcon,
  WrenchIcon,
  ZapIcon,
  ForwardIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { EIDOS_SPACE_BASE_URL } from "@/lib/const"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { useNewExtension } from "./hooks"

const ExtensionTooltip = ({ children }: { children: React.ReactNode }) => {
  return (
    <div
      className="ring ring-primary invisible group-hover:visible absolute left-full top-0 mr-2 w-64 rounded-md border text-popover-foreground bg-popover p-3 text-sm before:absolute before:-right-4 before:top-0 before:h-full before:w-4"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}

interface NewExtensionButtonProps {
  trigger?: React.ReactNode
}

export const NewExtensionButton = ({ trigger }: NewExtensionButtonProps) => {
  const { handleCreateNewExtension } = useNewExtension()
  const { t } = useTranslation()

  const defaultTrigger = (
    <Button size="sm" className="w-full justify-between">
      {t("common.new")} <ChevronDownIcon className="ml-1 h-4 w-4" />
    </Button>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger || defaultTrigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="overflow-visible" align="start">
        <DropdownMenuLabel>{t("extension.createNew")}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Script Extensions */}
        <DropdownMenuLabel className="flex items-center text-xs text-muted-foreground">
          {t("extension.scriptSection")}
        </DropdownMenuLabel>
        <DropdownMenuItem
          className="group relative"
          onClick={() => handleCreateNewExtension("tool")}
        >
          <WrenchIcon className="mr-2 h-4 w-4" />
          {t("extension.tool")}
          <ExtensionTooltip>{t("extension.toolDescription")}</ExtensionTooltip>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="group relative"
          onClick={() => handleCreateNewExtension("tableAction")}
        >
          <ZapIcon className="mr-2 h-4 w-4" />
          {t("extension.tableAction")}
          <ExtensionTooltip>
            {t("extension.tableActionDescription")}
          </ExtensionTooltip>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="group relative"
          onClick={() => handleCreateNewExtension("docAction")}
        >
          <ZapIcon className="mr-2 h-4 w-4" />
          {t("extension.docAction")}
          <ExtensionTooltip>
            {t("extension.docActionDescription")}
          </ExtensionTooltip>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="group relative"
          onClick={() => handleCreateNewExtension("fileAction")}
        >
          <ZapIcon className="mr-2 h-4 w-4" />
          {t("extension.fileAction", "File Action")}
          <ExtensionTooltip>
            {t(
              "extension.fileActionDescription",
              "Create a script to handle file actions"
            )}
          </ExtensionTooltip>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="group relative"
          onClick={() => handleCreateNewExtension("relayHandler")}
        >
          <ForwardIcon className="mr-2 h-4 w-4" />
          {t("extension.relayHandler", "Relay Handler")}
          <Badge variant="default" className="bg-primary">
            {t("common.badge.new")}
          </Badge>
          <ExtensionTooltip>
            {t(
              "extension.relayHandlerDescription",
              "Process incoming messages from Relay channels"
            )}
          </ExtensionTooltip>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="group relative"
          onClick={() => handleCreateNewExtension("udf")}
        >
          <DatabaseIcon className="mr-2 h-4 w-4" />
          {t("extension.udf")}{" "}
          <Badge variant="secondary">{t("common.badge.alpha")}</Badge>
          <ExtensionTooltip>
            {t("extension.udfDescription")}
            <br />
            <span className="text-red-400">{t("extension.udfWarning")}</span>
          </ExtensionTooltip>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="group relative"
          onClick={() => handleCreateNewExtension("emptyScript")}
        >
          <CodeIcon className="mr-2 h-4 w-4" />
          {t("extension.emptyScript")}
          <ExtensionTooltip>
            {t("extension.emptyScriptDescription")}
          </ExtensionTooltip>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Block Extensions */}
        <DropdownMenuLabel className="flex items-center text-xs text-muted-foreground">
          {t("extension.blockSection")}
        </DropdownMenuLabel>
        <DropdownMenuItem
          className="group relative"
          onClick={() => handleCreateNewExtension("tableView")}
        >
          <GridIcon className="mr-2 h-4 w-4" />
          {t("extension.tableView")}
          <ExtensionTooltip>
            {t("extension.tableViewDescription")}
          </ExtensionTooltip>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="group relative"
          onClick={() => handleCreateNewExtension("extNode")}
        >
          <PuzzleIcon className="mr-2 h-4 w-4" />
          {t("extension.extNode")}
          <Badge variant="default" className="bg-primary">
            {t("common.badge.new")}
          </Badge>
          <ExtensionTooltip>
            {t("extension.extNodeDescription")}
          </ExtensionTooltip>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="group relative"
          onClick={() => handleCreateNewExtension("fileHandler")}
        >
          <FileTypeIcon className="mr-2 h-4 w-4" />
          File Handler
          <Badge variant="default" className="bg-primary">
            {t("common.badge.new")}
          </Badge>
          <ExtensionTooltip>
            Handle specific file types with custom editors
          </ExtensionTooltip>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="group relative"
          onClick={() => handleCreateNewExtension("emptyBlock")}
        >
          <ToyBrickIcon className="mr-2 h-4 w-4" />
          {t("extension.emptyBlock")}
          <ExtensionTooltip>
            {t("extension.emptyBlockDescription")}
          </ExtensionTooltip>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Store Section */}
        <DropdownMenuLabel className="flex items-center text-xs text-muted-foreground">
          {t("extension.storeSection")}
        </DropdownMenuLabel>
        <DropdownMenuItem
          className="group relative"
          onClick={() =>
            window.open(`${EIDOS_SPACE_BASE_URL}/extensions`, "_blank")
          }
        >
          <ExternalLinkIcon className="mr-2 h-4 w-4" />
          {t("extension.browseStore")}
          <ExtensionTooltip>
            {t("extension.browseStoreDescription")}
          </ExtensionTooltip>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
