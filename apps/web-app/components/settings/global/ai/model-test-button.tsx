import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"

import { TaskType, useModelTest } from "./hooks"

interface ModelTestButtonProps {
  taskType: TaskType
  modelValue: string | undefined
}

export function ModelTestButton({
  taskType,
  modelValue,
}: ModelTestButtonProps) {
  const {
    testModel,
    isEmbeddingLoading,
    isTranslationLoading,
    isCodingLoading,
    isApplyCodeLoading,
  } = useModelTest()
  const { t } = useTranslation()

  const isLoading = {
    [TaskType.Embedding]: isEmbeddingLoading,
    [TaskType.Translation]: isTranslationLoading,
    [TaskType.Coding]: isCodingLoading,
    [TaskType.ApplyCode]: isApplyCodeLoading,
  }[taskType]

  return (
    <Button
      type="button"
      variant="outline"
      disabled={isLoading}
      onClick={() => testModel(taskType, modelValue)}
    >
      {isLoading ? t("common.testing") : t("common.test")}
    </Button>
  )
}
