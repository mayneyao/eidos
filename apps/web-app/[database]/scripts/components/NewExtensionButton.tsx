import { ChevronDownIcon } from "lucide-react"

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="xs">
          New <ChevronDownIcon className="ml-1 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="overflow-visible">
        <DropdownMenuLabel>Create New Extension</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="group relative"
          onClick={() => handleCreateNewScript("m_block")}
        >
          Micro Block <Badge variant="secondary">New</Badge>
          <ScriptTooltip>
            UI components for customized data display and interaction. Can be
            referenced in documents, covers, and right panels
          </ScriptTooltip>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="group relative"
          onClick={() => handleCreateNewScript()}
        >
          Script
          <ScriptTooltip>
            For custom data processing logic, triggered through the control
            panel (<kbd>⌘+K</kbd>), can also be used as table Actions
          </ScriptTooltip>
        </DropdownMenuItem>

        <DropdownMenuItem
          className="group relative"
          onClick={() => handleCreateNewScript("udf")}
        >
          UDF
          <ScriptTooltip>
            Use JavaScript to create custom calculation functions for use in
            table Formula fields. If you're not comfortable with SQL
            expressions, you can use UDF to implement custom calculation logic
          </ScriptTooltip>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="group relative"
          onClick={() => handleCreateNewScript("prompt")}
        >
          Prompt
          <ScriptTooltip>Templates for AI model interactions</ScriptTooltip>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
