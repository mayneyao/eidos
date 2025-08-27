import { useCallback, useContext, useState } from "react"
import { generateText } from "@/packages/ai/generate"
import type { IExtension } from "@/packages/core/types/IExtension"
import type { IField } from "@/packages/core/types/IField"
import type { DataEditorProps, GridSelection } from "@glideapps/glide-data-grid"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { useAiConfig } from "@/apps/web-app/hooks/use-ai-config"
import { useTableOperation } from "@/apps/web-app/hooks/use-table"

import { ScrollArea } from "../../../../ui/scroll-area"
import { TableContext } from "../../../hooks"

export const AITools = ({
  close,
  fields,
  selection,
  getRowByIndex,
  getFieldByIndex,
  setAIHighlightRegions,
}: {
  close: () => void
  fields: IField[]
  selection: GridSelection
  getRowByIndex: (index: number) => Record<string, any>
  getFieldByIndex: (index: number) => IField
  setAIHighlightRegions: (regions: DataEditorProps["highlightRegions"]) => void
}) => {
  const [customPrompt, setCustomPrompt] = useState<string>("")
  const [searchFieldName, setSearchFieldName] = useState<string>("")
  const [selectedPrompt, setSelectedPrompt] = useState<IExtension | null>(null)
  const { getConfigByModel, codingModel, textModel } = useAiConfig()
  const [step, setStep] = useState(0)
  const { space, tableName, viewId } = useContext(TableContext)
  const { updateCell } = useTableOperation(tableName, space)
  const [isProcessing, setIsProcessing] = useState(false)

  const getAIHighlightRegions = useCallback(
    (selectedField: string): DataEditorProps["highlightRegions"] => {
      if (selectedPrompt && selection.current) {
        const x = fields.findIndex((f) => f.table_column_name === selectedField)
        return [
          {
            color: "#b000b021",
            range: {
              x: x,
              y: selection.current.range.y,
              width: 1,
              height: selection.current.range.height,
            },
            // style: "solid",
          },
        ]
      }
      return []
    },
    [selectedPrompt, selection, fields]
  )

  const runAction = useCallback(
    async (selectedField: string) => {
      setIsProcessing(true)
      try {
        if (selectedPrompt && selection.current) {
          const highlightRegions = getAIHighlightRegions(selectedField)
          setAIHighlightRegions(highlightRegions)
          const { code } = selectedPrompt
          const model = codingModel || textModel
          const config = getConfigByModel(model)
          const field = getFieldByIndex(selection.current.range.x)
          const startIndex = selection.current.range.y
          const endIndex = startIndex + selection.current.range.height
          for (let i = startIndex; i < endIndex; i++) {
            const row = getRowByIndex(i)
            const input = row[field.table_column_name]
            const needFixMessage = config.baseUrl?.includes("deepseek")
            if (!input) return
            const res = await generateText({
              systemPrompt: code,
              prompt: input,
              config: {
                apiKey: config.apiKey!,
                baseURL: needFixMessage ? "/" : config.baseUrl!,
              },
              modelId: needFixMessage ? model! : config.modelId,
            })
            updateCell(row._id, selectedField, res)
          }
        }
      } catch (error) {
      } finally {
        setIsProcessing(false)
        setAIHighlightRegions([])
        close()
      }
    },
    [
      selectedPrompt,
      selection,
      getAIHighlightRegions,
      setAIHighlightRegions,
      getFieldByIndex,
      getRowByIndex,
      getConfigByModel,
      updateCell,
      close,
    ]
  )

  if (isProcessing) {
    return null
  }
  if (step === 1) {
    return (
      <Command className=" h-[300px] w-[200px] rounded-md border shadow-md">
        <CommandInput
          placeholder="Search Fields..."
          autoFocus
          value={searchFieldName}
          onValueChange={(value) => {
            setSearchFieldName(value)
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && searchFieldName === "") {
              setStep(0)
            }
            if (e.key === "Escape") {
              setStep(0)
            }
          }}
        />
        <CommandEmpty>No Field found.</CommandEmpty>
        <CommandGroup>
          {fields.map((field) => (
            <CommandItem
              key={field.table_column_name}
              value={field.name}
              onSelect={(currentValue) => {
                runAction(field.table_column_name)
                setStep(2)
              }}
            >
              {field.name}
            </CommandItem>
          ))}
        </CommandGroup>
      </Command>
    )
  }
  return (
    <Command className=" w-[200px] rounded-md border shadow-md">
      <CommandInput
        placeholder="Search prompt..."
        autoFocus
        value={customPrompt}
        onValueChange={(value) => {
          setCustomPrompt(value)
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            close()
          }
        }}
      />

      <ScrollArea>
        <CommandList className="max-h-[300px]">
          <CommandEmpty>
            No Prompt found.
            <br />
            Press <kbd>ESC</kbd> to close.
          </CommandEmpty>
          <CommandGroup>
            {/* Custom prompts are no longer supported */}
          </CommandGroup>
        </CommandList>
      </ScrollArea>
    </Command>
  )
}
