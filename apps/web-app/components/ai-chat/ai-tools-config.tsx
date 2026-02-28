import { WrenchIcon } from "lucide-react"
import { useCallback, useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { useAllTools } from "@/apps/web-app/hooks/use-all-tools"
import { useExtensionNavigateById } from "@/apps/web-app/hooks/use-extension-navigate"
import { useSqliteKV } from "@/apps/web-app/hooks/use-sqlite-kv"

interface AIToolsConfigProps {
  isLoading?: boolean
  onToolsChange?: (filteredTools: Record<string, any>) => void
}

const ENABLED_TOOLS_KV_KEY = "eidos:space:ai-tools"
const MAX_STEPS_KV_KEY = "eidos:space:ai-tools:max-steps"
const DEFAULT_MAX_STEPS = 5

const buildDefaultToolState = (tools: Record<string, any>) =>
  Object.keys(tools).reduce(
    (acc, toolName) => ({ ...acc, [toolName]: true }),
    {} as Record<string, boolean>
  )

function useEnabledToolsKV(tools: Record<string, any>) {
  const [kvEnabledTools, setKvEnabledTools] = useSqliteKV<
    Record<string, boolean>
  >(ENABLED_TOOLS_KV_KEY, {})

  useEffect(() => {
    const toolNames = Object.keys(tools)
    const hasStoredValue =
      kvEnabledTools && Object.keys(kvEnabledTools).length > 0

    if (!toolNames.length || hasStoredValue) return

    setKvEnabledTools(buildDefaultToolState(tools))
  }, [kvEnabledTools, setKvEnabledTools, tools])

  return {
    enabledTools: kvEnabledTools || {},
    setEnabledTools: setKvEnabledTools,
  }
}

function useMaxStepsKV() {
  const [kvMaxSteps, setKvMaxSteps] = useSqliteKV<number>(
    MAX_STEPS_KV_KEY,
    DEFAULT_MAX_STEPS
  )

  const setMaxSteps = useCallback(
    (value: number) => {
      if (Number.isNaN(value) || value <= 0) return
      setKvMaxSteps(value)
    },
    [setKvMaxSteps]
  )

  return {
    maxSteps: kvMaxSteps ?? DEFAULT_MAX_STEPS,
    setMaxSteps,
  }
}

export function AIToolsConfig({
  isLoading = false,
  onToolsChange,
}: AIToolsConfigProps) {
  const { t } = useTranslation()
  const tools = useAllTools()
  const { maxSteps, setMaxSteps } = useMaxStepsKV()

  const { enabledTools, setEnabledTools } = useEnabledToolsKV(tools)

  const filteredTools = useMemo(() => {
    const filtered: Record<string, any> = {}
    Object.entries(tools).forEach(([key, tool]) => {
      if (enabledTools[key]) {
        filtered[key] = tool
      }
    })
    return filtered
  }, [tools, enabledTools])

  useEffect(() => {
    onToolsChange?.(filteredTools)
  }, [filteredTools, onToolsChange])

  const handleToggleTool = (toolName: string) => {
    setEnabledTools({
      ...enabledTools,
      [toolName]: !enabledTools[toolName],
    })
  }

  const handleMaxStepsChange = (value: string) => {
    const steps = parseInt(value, 10)
    if (!isNaN(steps) && steps > 0) {
      setMaxSteps(steps)
    }
  }

  const navigateToExtension = useExtensionNavigateById()

  // Helper function to check if toolId matches xx.xxx format and extract extensionId
  const getExtensionId = (toolId: string): string | null => {
    const match = toolId.match(/^([^.]+)\.(.+)$/)
    return match ? match[1] : null
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" disabled={isLoading}>
          <WrenchIcon className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">
              {t("aiChat.toolsConfig.title", "Tools Configuration")}
            </h4>
            <p className="text-sm text-muted-foreground">
              {t(
                "aiChat.toolsConfig.description",
                "Configure which tools are available for the AI assistant"
              )}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <Label className="text-sm font-medium">Max Steps</Label>
                <p className="text-xs text-muted-foreground">
                  Maximum number of steps for tool calls
                </p>
              </div>
              <Input
                type="number"
                min="1"
                max="20"
                value={maxSteps}
                onChange={(e) => handleMaxStepsChange(e.target.value)}
                className="w-16 h-8"
              />
            </div>
          </div>

          <div className="space-y-2">
            {Object.entries(tools).map(([toolName, tool]) => {
              const extensionId = getExtensionId((tool as any).id || toolName)

              return (
                <div
                  key={toolName}
                  className="flex items-start justify-between"
                >
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium">{toolName}</Label>
                      {extensionId ? (
                        <Badge
                          variant="secondary"
                          className="text-xs cursor-pointer hover:bg-secondary/80 rounded-md"
                          onClick={() => navigateToExtension(extensionId)}
                        >
                          User-defined
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs rounded-md">
                          Built-in
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {(tool as any).description || "No description available"}
                    </p>
                  </div>
                  <Switch
                    checked={enabledTools[toolName] || false}
                    onCheckedChange={() => handleToggleTool(toolName)}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Hook to get filtered tools for external use
export function useFilteredTools() {
  const tools = useAllTools()
  const { enabledTools } = useEnabledToolsKV(tools)

  return useMemo(() => {
    const filtered: Record<string, any> = {}

    Object.entries(tools).forEach(([key, tool]) => {
      const isEnabled =
        Object.keys(enabledTools).length === 0 ? true : enabledTools[key]
      if (isEnabled) {
        filtered[key] = tool
      }
    })

    return filtered
  }, [tools, enabledTools])
}

// Hook to get max steps for external use
export function useMaxSteps() {
  const { maxSteps } = useMaxStepsKV()
  return maxSteps
}
