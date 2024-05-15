import { useCallback, useContext, useState } from "react"
import { IScript } from "@/worker/web-worker/meta-table/script"
import { GridSelection } from "@glideapps/glide-data-grid"

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
} from "@/components/ui/command"

import { useUserPrompts } from "../ai-chat/hooks"
import { TwinkleSparkle } from "../loading"
import { TableContext } from "../table/hooks"

export const AITools = ({
  close,
  fields,
  selection,
  getRowByIndex,
  getFieldByIndex,
}: {
  close: () => void
  fields: IField[]
  selection: GridSelection
  getRowByIndex: (index: number) => Record<string, any>
  getFieldByIndex: (index: number) => IField
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

  const runAction = useCallback(
    async (selectedField: string) => {
      setIsProcessing(true)
      try {
        if (selectedPrompt && selection.current) {
          const { model, code } = selectedPrompt
          const needFixMessage =
            model?.includes("deepseek") || !model?.includes("@")
          const field = getFieldByIndex(selection.current.range.x)
          const startIndex = selection.current.range.y
          const endIndex = startIndex + selection.current.range.height
          for (let i = startIndex; i < endIndex; i++) {
            const row = getRowByIndex(i)
            const input = row[field.table_column_name]
            const config = getConfigByModel(model!)
            if (!input) return
            const res = await generateText({
              systemPrompt: code,
              prompt: input,
              config: {
                apiKey: config.token!,
                baseURL: needFixMessage ? "/" : config.baseUrl,
              },
              modelId: needFixMessage ? model! : config.modelId,
            })
            updateCell(row._id, selectedField, res)
          }
        }
      } catch (error) {
      } finally {
        setIsProcessing(false)
        close()
      }
    },
    [
      selectedPrompt,
      selection,
      close,
      getFieldByIndex,
      getRowByIndex,
      getConfigByModel,
      updateCell,
    ]
  )

  if (isProcessing) {
    return <TwinkleSparkle />
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
    <Command className=" h-[300px] w-[200px] rounded-md border shadow-md">
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
      <CommandEmpty>No Action found.</CommandEmpty>
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
    </Command>
  )
}
