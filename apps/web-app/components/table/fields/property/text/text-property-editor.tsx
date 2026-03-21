import { useCallback, useContext, useEffect, useState } from "react"
import { AlertTriangle, HelpCircle, Sparkles } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useSettings } from "@/apps/web-app/hooks/use-settings"
import { toast } from "sonner"

import type { TextProperty } from "@/packages/core/fields/text"
import type { IField } from "@/packages/core/types/IField"
import { getTableIdByRawTableName } from "@/lib/utils"
import { useAiConfig } from "@/apps/web-app/hooks/use-ai-config"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { EmbeddingStatsProgress } from "@/components/embedding-stats-progress"
import { TableContext } from "@/components/table/hooks"

import { usePreview } from "./hooks"

interface IFieldPropertyEditorProps {
  uiColumn: IField<TextProperty>
  onPropertyChange: (property: TextProperty) => void
  isCreateNew?: boolean
}

export const TextPropertyEditor = (props: IFieldPropertyEditorProps) => {
  const { t } = useTranslation()
  const { openSettingsModal } = useSettings()
  const [enableEmbedding, setEnableEmbedding] = useState(
    props.uiColumn.property?.enableEmbedding ?? false
  )
  const [enableColorHint, setEnableColorHint] = useState(
    props.uiColumn.property?.enableColorHint ?? false
  )
  const { viewId, tableName } = useContext(TableContext)
  const { embeddingModel } = useAiConfig()
  const [isProcessing, setIsProcessing] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [progress, setProgress] = useState({
    processed: 0,
    total: 0,
    percentage: 0,
  })

  const updateProperty = (updates: Partial<TextProperty>) => {
    const currentProperty = props.uiColumn.property || {}
    const updatedProperty = {
      ...currentProperty,
      ...updates,
    }
    props.onPropertyChange(updatedProperty as TextProperty)
  }

  const { process, getEmbeddingStats, resetEmbedding } =
    usePreview(updateProperty)

  const modelMismatch =
    !!props.uiColumn.property?.model &&
    !!embeddingModel &&
    props.uiColumn.property.model !== embeddingModel

  const [embeddingStats, setEmbeddingStats] = useState<{
    total: number
    vectorized: number
    outdated: number
    upToDate: number
    vectorizedPercentage: number
    outdatedPercentage: number
    upToDatePercentage: number
  }>()

  const fetchEmbeddingStats = useCallback(async () => {
    if (props.uiColumn.property?.enableEmbedding) {
      const stats = await getEmbeddingStats(
        getTableIdByRawTableName(tableName),
        props.uiColumn.table_column_name
      )
      setEmbeddingStats(stats)
    }
  }, [
    props.uiColumn.property?.enableEmbedding,
    getEmbeddingStats,
    tableName,
    props.uiColumn.table_column_name,
  ])

  useEffect(() => {
    fetchEmbeddingStats()
  }, [
    props.uiColumn.table_column_name,
    props.uiColumn.property?.enableEmbedding,
    progress,
  ])

  useEffect(() => {
    setEnableEmbedding(props.uiColumn.property?.enableEmbedding ?? false)
    setEnableColorHint(props.uiColumn.property?.enableColorHint ?? false)
  }, [
    props.uiColumn.property?.enableEmbedding,
    props.uiColumn.property?.enableColorHint,
  ])

  const handleEmbeddingToggle = (checked: boolean) => {
    if (!embeddingModel) {
      toast.error(t("table.propertyEditor.noEmbeddingModel"))
      return
    }
    setEnableEmbedding(checked)
    if (!props.uiColumn.property?.model) {
      updateProperty({ enableEmbedding: checked, model: embeddingModel })
    } else {
      updateProperty({ enableEmbedding: checked })
    }
  }

  const handleColorHintToggle = (checked: boolean) => {
    setEnableColorHint(checked)
    updateProperty({ enableColorHint: checked })
  }

  const handleProcess = async () => {
    if (isProcessing) return
    setIsProcessing(true)
    try {
      await process(
        getTableIdByRawTableName(tableName),
        viewId!,
        props.uiColumn.table_column_name,
        (progress) => {
          setProgress(progress)
        }
      )
      toast.success(t("table.propertyEditor.processComplete"))
    } catch (error) {
      toast.error(t("table.propertyEditor.processError"))
    } finally {
      setIsProcessing(false)
      setProgress({ processed: 0, total: 0, percentage: 0 })
    }
  }

  const handleResetVectors = async () => {
    if (isResetting) return
    setIsResetting(true)
    try {
      const res = await resetEmbedding(
        getTableIdByRawTableName(tableName),
        props.uiColumn.table_column_name
      )
      toast.success(t("table.propertyEditor.resetVectorsSuccess"))
    } catch (error) {
      toast.error(t("table.propertyEditor.resetVectorsError"))
    } finally {
      setIsResetting(false)
    }
  }

  const { isView } = useContext(TableContext)
  if (isView) {
    return null
  }

  return (
    <div className="space-y-3">
      <Separator />

      {/* AI Enhancement Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-purple-500" />
        <span className="text-xs font-medium text-foreground">
          {t("table.propertyEditor.aiEnhancement")}
        </span>
        <span className="px-1.5 py-0 text-[10px] rounded-full bg-purple-100 text-purple-700">
          {t("common.badge.alpha")}
        </span>
      </div>

      {/* Model Info */}
      {!embeddingModel ? (
        <p className="text-[11px] text-destructive leading-relaxed">
          {t("table.propertyEditor.noEmbeddingModelHint")}{" "}
          <button
            onClick={() => openSettingsModal("ai")}
            className="underline hover:no-underline"
          >
            {t("table.propertyEditor.configureNow")}
          </button>
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          {t("table.propertyEditor.currentEmbeddingModel")}:{" "}
          <button
            onClick={() => openSettingsModal("ai")}
            className="underline hover:no-underline text-foreground"
          >
            {embeddingModel}
          </button>
        </p>
      )}

      {/* Model Mismatch Warning */}
      {modelMismatch && (
        <div className="space-y-2">
          <div
            className={cn(
              "flex items-start gap-1.5 rounded-md border p-2 text-[11px]",
              "border-yellow-300 bg-yellow-50 text-yellow-700",
              "dark:border-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              {t("table.propertyEditor.modelMismatchWarning")}{" "}
              {t("table.propertyEditor.usedModel")}:{" "}
              {props.uiColumn.property?.model}
            </span>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleResetVectors}
            disabled={isResetting}
            className="h-7 text-xs w-full"
          >
            {isResetting
              ? t("table.propertyEditor.resettingVectors")
              : t("table.propertyEditor.resetVectors")}
          </Button>
        </div>
      )}

      {/* Toggles */}
      <div className="space-y-2">
        {/* Enable embedding toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Label
              className={cn(
                "text-xs",
                !embeddingModel && "text-muted-foreground"
              )}
              htmlFor="enable-embedding"
            >
              {t("table.propertyEditor.enableEmbedding")}
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[200px] text-xs">
                  {t("table.propertyEditor.enableEmbeddingTip")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Switch
            id="enable-embedding"
            checked={enableEmbedding}
            onCheckedChange={handleEmbeddingToggle}
            disabled={!embeddingModel}
            className="scale-75"
          />
        </div>

        {/* Color Hint Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Label className="text-xs" htmlFor="enable-color-hint">
              {t("table.propertyEditor.enableColorHint")}
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[200px] text-xs">
                  {t("table.propertyEditor.enableColorHintTip")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Switch
            id="enable-color-hint"
            checked={enableColorHint}
            onCheckedChange={handleColorHintToggle}
            className="scale-75"
          />
        </div>
      </div>

      {/* Embedding Stats */}
      {enableEmbedding && <EmbeddingStatsProgress stats={embeddingStats} />}

      {/* Process Button */}
      <div className="relative">
        <Button
          variant="outline"
          className="w-full relative h-7 text-xs"
          onClick={handleProcess}
          disabled={
            isProcessing || !enableEmbedding || !embeddingModel || modelMismatch
          }
        >
          <div
            className="absolute inset-0 bg-primary/10 origin-left transition-all duration-300"
            style={{
              width: `${progress.percentage}%`,
              opacity: isProcessing ? 1 : 0,
            }}
          />
          <span className="relative">
            {isProcessing
              ? `${t("table.propertyEditor.processing")} ${progress.percentage}%`
              : t("table.propertyEditor.process")}
          </span>
        </Button>
      </div>
    </div>
  )
}
