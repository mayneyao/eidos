import React, { useState } from "react"
import { type ITreeNode } from "@/packages/core/types/ITreeNode"
import { HelpCircle } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { DocProperty } from "@/components/doc-property"

import { DocPropertyGlobal } from "./index"

interface PropertyTabsProps {
  docId: string
  parentNode?: ITreeNode | null
}

export const PropertyTabs: React.FC<PropertyTabsProps> = ({
  docId,
  parentNode,
}) => {
  const { t } = useTranslation()
  const isParentTable = parentNode?.type === "table"
  const defaultTab = isParentTable ? "table-properties" : "global-properties"

  const [activeTab, setActiveTab] = useState(defaultTab)

  return (
    <div className="w-full" id="doc-property-container">
      <div className="flex items-center gap-4 mb-3 border-b border-border/50">
        <button
          onClick={() => setActiveTab("global-properties")}
          className={cn(
            "text-sm font-medium pb-2 border-b-2 transition-colors flex items-center gap-1",
            activeTab === "global-properties"
              ? "text-foreground border-foreground"
              : "text-muted-foreground border-transparent hover:text-foreground hover:border-border"
          )}
        >
          {t("doc.properties.globalProperties")}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {t("doc.properties.globalPropertiesTooltip")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </button>
        {isParentTable && (
          <button
            onClick={() => setActiveTab("table-properties")}
            className={cn(
              "text-sm font-medium pb-2 border-b-2 transition-colors flex items-center gap-1",
              activeTab === "table-properties"
                ? "text-foreground border-foreground"
                : "text-muted-foreground border-transparent hover:text-foreground hover:border-border"
            )}
          >
            {t("doc.properties.tableProperties")}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  {t("doc.properties.tablePropertiesTooltip")} [
                  {parentNode.name}]
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </button>
        )}
      </div>

      <div className="w-full">
        <div
          className={cn(
            "w-full transition-all duration-200 ease-in-out",
            activeTab === "global-properties"
              ? "opacity-100 visible"
              : "opacity-0 invisible h-0 overflow-hidden"
          )}
        >
          <DocPropertyGlobal docId={docId} parentNode={parentNode} />
        </div>

        {isParentTable && (
          <div
            className={cn(
              "w-full transition-all duration-200 ease-in-out",
              activeTab === "table-properties"
                ? "opacity-100 visible"
                : "opacity-0 invisible h-0 overflow-hidden"
            )}
          >
            <DocProperty tableId={parentNode.id} docId={docId} />
          </div>
        )}
      </div>
    </div>
  )
}

export default PropertyTabs
