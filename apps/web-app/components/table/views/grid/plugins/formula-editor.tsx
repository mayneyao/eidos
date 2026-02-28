import { useContext, useEffect, useMemo, useState } from "react"
import { FieldType } from "@/packages/core/fields/const"
import type { FormulaProperty } from "@/packages/core/fields/formula"
import type { IField } from "@/packages/core/types/IField"
import { useDebounceFn } from "ahooks"
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  Code2Icon as Code,
  FunctionSquareIcon,
  Hash,
  Info,
  Variable,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link } from "@/components/ui/link"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  CodeMirrorFormulaEditor,
  type CodeMirrorFormulaEditorRef,
} from "@/components/formula-editor/codemirror-editor"
import {
  getCompletions,
  type UiColumn,
} from "@/components/formula-editor/completions"
import { TableContext } from "@/components/table/hooks"
import { useFormulaUpdate } from "@/apps/web-app/hooks/use-formula-update"
import { useFormulaValidation } from "@/apps/web-app/hooks/use-formula-validation"
import { usePreviewTableFormula } from "@/apps/web-app/hooks/use-preview-table-formula"
import { useTableOperation } from "@/apps/web-app/hooks/use-table"

import { useGenerateFormula } from "./use-generate-formula"

export const FormulaEditor = ({
  editorRef,
  closeEditor,
  formulaField,
  uiColumns,
  rowId,
}: {
  editorRef: React.RefObject<CodeMirrorFormulaEditorRef>
  closeEditor: () => void
  formulaField: IField<FormulaProperty> | null
  uiColumns: UiColumn[]
  rowId: string | null
}) => {
  const { t } = useTranslation()
  const [formula, setFormula] = useState(formulaField?.property.formula ?? "")
  const { udfs = [], tableName, space } = useContext(TableContext)
  const { updateFieldProperty } = useTableOperation(tableName, space)
  const [previewResult, setPreviewResult] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const { preview } = usePreviewTableFormula()
  const validateFormula = useFormulaValidation()
  const [isAiPromptMode, setIsAiPromptMode] = useState(false)
  const [showFullError, setShowFullError] = useState(false)
  const uiColumnsWithSystemFields = useMemo(() => {
    return [
      {
        name: "_id",
        type: FieldType.Text,
        table_column_name: "_id",
        table_name: tableName,
        property: {},
        info: "Unique ID for each row",
      },
      ...uiColumns,
    ]
  }, [uiColumns, tableName])

  const { generateFormulaConfig, isLoading: isGeneratingFormula } =
    useGenerateFormula()

  const { run: validateAndPreview } = useDebounceFn(
    async () => {
      const result = validateFormula(formula, formulaField)
      if (result.isValid && result.result) {
        setValidationError(null)
        const previewResult = await preview({
          tableName,
          formula: result.result,
          rowId,
        })
        setPreviewResult(previewResult)
      } else {
        setValidationError(result.error)
      }
    },
    { wait: 500 }
  )

  useEffect(() => {
    formulaField?.property.formula && setFormula(formulaField?.property.formula)
  }, [formulaField?.property.formula])

  useEffect(() => {
    if (isAiPromptMode) {
      setValidationError(null)
      setPreviewResult(null)
    } else {
      validateAndPreview()
    }
  }, [formula, rowId, isAiPromptMode])

  const { error, updateFormula } = useFormulaUpdate(
    formulaField,
    (property) => {
      if (formulaField) {
        updateFieldProperty(formulaField, property)
      }
    }
  )
  const handleSave = () => {
    if (formulaField) {
      const isUpdated = updateFormula(
        formula,
        formulaField.property.displayType
      )
      if (isUpdated) {
        closeEditor()
      }
    }
  }

  const completionItems = useMemo(() => {
    return getCompletions(uiColumnsWithSystemFields, udfs || [])
  }, [uiColumnsWithSystemFields, udfs])

  const handleCurrentTokenChange = (
    token: { text: string; type: string } | null
  ) => {
    try {
      if (token?.type === "Identifier") {
        const completionItem = completionItems.find(
          (item) => item.label.toLowerCase() === token.text.toLowerCase()
        )
        if (completionItem) {
          setSelectedItem(completionItem)
          // scroll to the completion item
          const completionItemElement = document.querySelector(
            `.group[data-label="${completionItem.label}"]`
          )
          if (completionItemElement) {
            completionItemElement.scrollIntoView({
              behavior: "smooth",
              block: "center",
            })
          }
        }
      }
    } catch (error) {
      console.error("Error in handleCurrentTokenChange:", error)
    }
  }

  const renderCompletionItem = (item: any) => (
    <div
      key={item.label}
      data-label={item.label}
      className={cn(
        "group relative flex px-3 py-2 hover:bg-accent cursor-pointer text-sm",
        selectedItem?.label === item.label && "bg-accent"
      )}
      onClick={() => {
        try {
          if (editorRef.current) {
            const suffix = item.type === "function" ? "()" : ""
            editorRef.current.insertText(item.label + suffix)
          }
        } catch (error) {
          console.error("Error inserting text:", error)
        }
      }}
    >
      <div className="mr-2 flex-shrink-0 mt-0.5 text-muted-foreground">
        {item.type === "function" && <FunctionSquareIcon size={16} />}
        {item.type === "variable" && <Variable size={16} />}
        {item.type === "constant" && <Calculator size={16} />}
        {(item.type === "keyword" || item.type === "operator") && (
          <Hash size={16} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium">{item.label}</div>
        {item.info && (
          <div className="text-xs text-muted-foreground truncate">
            {item.info}
          </div>
        )}
      </div>
    </div>
  )

  const handleArrowNavigation = (direction: "up" | "down") => {
    try {
      if (completionItems.length === 0) return

      if (!selectedItem) {
        setSelectedItem(completionItems[0])
        return
      }

      const currentIndex = completionItems.findIndex(
        (item) => item.label === selectedItem.label
      )

      let newIndex
      if (direction === "up") {
        newIndex =
          currentIndex > 0 ? currentIndex - 1 : completionItems.length - 1
      } else {
        newIndex =
          currentIndex < completionItems.length - 1 ? currentIndex + 1 : 0
      }

      setSelectedItem(completionItems[newIndex])

      // Scroll to the selected item with improved performance
      const completionItemElement = document.querySelector(
        `.group[data-label="${completionItems[newIndex].label}"]`
      )
      if (completionItemElement) {
        // Use 'auto' instead of 'smooth' for better performance during rapid scrolling
        completionItemElement.scrollIntoView({
          behavior: "auto",
          block: "nearest",
        })
      }
    } catch (error) {
      console.error(
        `Error in handleArrow${direction === "up" ? "Up" : "Down"}:`,
        error
      )
    }
  }

  const handleAiComplete = async (prompt: string) => {
    console.log("handleAiComplete", prompt)
    const tableFields = uiColumnsWithSystemFields.map((column) => column.name)
    const result = await generateFormulaConfig(prompt, tableFields)
    console.log("result", result)
    if (result) {
      setFormula(result.formula)
    }
  }

  const handleArrowUp = () => handleArrowNavigation("up")
  const handleArrowDown = () => handleArrowNavigation("down")

  const handleEnter = () => {
    try {
      if (selectedItem) {
        const suffix = selectedItem.type === "function" ? "()" : ""
        editorRef.current?.insertText(selectedItem.label + suffix)
      }
    } catch (error) {
      console.error("Error in handleEnter:", error)
    }
  }

  return (
    <div className="bg-background w-full min-w-[500px] max-w-[600px] border rounded-lg flex shadow-lg">
      <div className="flex-1 flex flex-col min-w-0 relative">
        <CodeMirrorFormulaEditor
          ref={editorRef}
          value={formula}
          onChange={(value) => setFormula(value)}
          onEsc={closeEditor}
          onCurrentTokenChange={handleCurrentTokenChange}
          onArrowUp={handleArrowUp}
          onArrowDown={handleArrowDown}
          onEnter={handleEnter}
          columns={uiColumnsWithSystemFields}
          udfs={udfs}
          height="100px"
          placeholder="Enter a SQL expression or tap // to start an AI prompt"
          onAiPromptModeChange={setIsAiPromptMode}
          onAiComplete={handleAiComplete}
          isGeneratingFormula={isGeneratingFormula}
        />
        <div className="flex justify-end gap-2 absolute top-[60px] right-2 z-10">
          <Button variant="outline" size="xs" onClick={closeEditor}>
            {t("common.cancel")}
          </Button>
          <Button variant="default" size="xs" onClick={handleSave}>
            {t("common.save")}
          </Button>
        </div>
        <div className="min-h-[40px] p-2">
          {validationError ? (
            <div className="text-sm text-destructive font-medium">
              {validationError.includes("\n") ? (
                <>
                  <div className="flex items-center gap-1">
                    <span>{validationError.split("\n")[0]}</span>
                    <button
                      onClick={() => setShowFullError((prev) => !prev)}
                      className="text-xs flex items-center gap-0.5 underline hover:text-destructive/80 ml-1"
                    >
                      {showFullError ? (
                        <>
                          {t("common.collapse")} <ChevronUp size={14} />
                        </>
                      ) : (
                        <>
                          {t("common.expand")} <ChevronDown size={14} />
                        </>
                      )}
                    </button>
                  </div>
                  {showFullError && (
                    <pre className="mt-1 text-xs bg-destructive/10 p-1 rounded max-h-[120px] overflow-y-auto">
                      {validationError}
                    </pre>
                  )}
                </>
              ) : (
                <pre>{validationError}</pre>
              )}
            </div>
          ) : previewResult ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info size={16} />
                  </TooltipTrigger>
                  <TooltipContent>{t("formula.editor.preview")}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {previewResult}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground opacity-0">
              {t("formula.editor.preview")}
            </p>
          )}
        </div>
        <div className="w-full border-t grid grid-cols-5">
          <div className="col-span-2 border-r">
            <div className="max-h-[200px] overflow-y-auto">
              <div className="py-1">
                {completionItems.map((item) => (
                  <div
                    key={item.label}
                    className="group"
                    data-label={item.label}
                    onMouseEnter={() => setSelectedItem(item)}
                  >
                    {renderCompletionItem(item)}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="col-span-3 p-4">
            {selectedItem?.example && (
              <div className="text-sm text-muted-foreground">
                <div className="font-medium mb-2 flex items-center gap-1">
                  {t("formula.editor.example")}{" "}
                  {selectedItem?.detail === "UDF" && (
                    <Link
                      to={`/extensions/${selectedItem.id}`}
                      className="text-xs text-muted-foreground underline hover:text-destructive/80"
                    >
                      <Code size={14} />
                    </Link>
                  )}
                </div>
                <div className="bg-muted p-2 rounded">
                  <pre className="text-xs text-muted-foreground max-h-[400px] overflow-y-auto">
                    {selectedItem.example}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="p-3 border-t">
          <p className="text-sm text-muted-foreground">
            {t("formula.editor.hint")}
          </p>
        </div>
      </div>
    </div>
  )
}

export default FormulaEditor
