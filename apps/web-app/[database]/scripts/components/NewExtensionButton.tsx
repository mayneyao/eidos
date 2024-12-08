import { ChevronDownIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

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

import { useNewScript } from "../hooks/use-new-script"

const ScriptTooltip = ({ children }: { children: React.ReactNode }) => {
  return (
    <div
      className="ring invisible group-hover:visible absolute left-full top-0 ml-2 w-64 rounded-md border bg-popover p-3 text-sm before:absolute before:-left-4 before:top-0 before:h-full before:w-4"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}

export const NewExtensionButton = () => {
  const { handleCreateNewScript } = useNewScript()
  const { t } = useTranslation()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="xs">
          {t("common.new")} <ChevronDownIcon className="ml-1 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="overflow-visible">
        <DropdownMenuLabel>{t("extension.createNew")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="group relative"
          onClick={() => handleCreateNewScript("m_block")}
        >
          {t("extension.microBlock")}{" "}
          <Badge variant="secondary">{t("common.badge.new")}</Badge>
          <ScriptTooltip>{t("extension.microBlockDescription")}</ScriptTooltip>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="group relative"
          onClick={() => handleCreateNewScript("doc_plugin")}
        >
          {t("extension.docPlugin")}
          <Badge variant="secondary">{t("common.badge.alpha")}</Badge>
          <ScriptTooltip>{t("extension.docPluginDescription")}</ScriptTooltip>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="group relative"
          onClick={() => handleCreateNewScript()}
        >
          {t("extension.script")}
          <ScriptTooltip>{t("extension.scriptDescription")}</ScriptTooltip>
        </DropdownMenuItem>

        <DropdownMenuItem
          className="group relative"
          onClick={() => handleCreateNewScript("udf")}
        >
          {t("extension.udf")}{" "}
          <Badge variant="secondary">{t("common.badge.alpha")}</Badge>
          <ScriptTooltip>
            {t("extension.udfDescription")}
            <br />
            <span className="text-red-400">{t("extension.udfWarning")}</span>
          </ScriptTooltip>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="group relative"
          onClick={() => handleCreateNewScript("prompt")}
        >
          {t("extension.prompt")}
          <ScriptTooltip>{t("extension.promptDescription")}</ScriptTooltip>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
