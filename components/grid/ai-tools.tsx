import { useCallback, useContext, useState } from "react"
import { IScript } from "@/worker/web-worker/meta-table/script"
import { DataEditorProps, GridSelection } from "@glideapps/glide-data-grid"

import { generateText } from "@/lib/ai/generate"
import { IField } from "@/lib/store/interface"
import { useAiConfig } from "@/hooks/use-ai-config"
import { useTableOperation } from "@/hooks/use-table"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

import { useUserPrompts } from "../ai-chat/hooks"
import { TableContext } from "../table/hooks"
import { ScrollArea } from "../ui/scroll-area"

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
  const [selectedPrompt, setSelectedPrompt] = useState<IScript | null>(null)
  const { prompts } = useUserPrompts()
  const { getConfigByModel } = useAiConfig()
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
          const { model, code } = selectedPrompt
          const field = getFieldByIndex(selection.current.range.x)
          const startIndex = selection.current.range.y
          const endIndex = startIndex + selection.current.range.height
          for (let i = startIndex; i < endIndex; i++) {
            const row = getRowByIndex(i)
            const input = row[field.table_column_name]
            const config = getConfigByModel(model!)
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
        placeholder="Search Action..."
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
            No Action found.
            <br />
            Press <kbd>ESC</kbd> to close.
          </CommandEmpty>
          <CommandGroup>
            {prompts.map((prompt) => (
              <CommandItem
                key={prompt.id}
                value={prompt.name}
                onSelect={(currentValue) => {
                  setSelectedPrompt(prompt)
                  setStep(1)
                }}
              >
                {prompt.name}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </ScrollArea>
    </Command>
  )
}
