import { useState } from "react"
import { useTranslation } from "react-i18next"

import { downloadWebLLM } from "@/lib/ai/helper"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { AIModelSelect } from "@/components/ai-chat/ai-chat-model-select"
import { WEB_LLM_MODELS } from "@/components/ai-chat/webllm/models"

const controller = new AbortController()

export const LocalLLMManage = (props: {
  models: string[]
  setModels: (models: string[]) => void
}) => {
  const { models, setModels } = props
  const [currentModel, setCurrentModel] = useState<string>("")
  const [progress, setProgress] = useState(0)
  const [loading, setLoading] = useState(false)
  const { t } = useTranslation()

  const cancelDownload = () => {
    controller.abort()
    setProgress(0)
    setLoading(false)
  }

  const handleAdd = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (loading) {
      cancelDownload()
      return
    }

    setLoading(true)
    const model = WEB_LLM_MODELS.find((item) => item.model_id === currentModel)
    if (model) {
      await downloadWebLLM(model, controller.signal, setProgress)
      setModels([...models, currentModel])
    }
    setLoading(false)
  }

  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.ai.localLLMTitle")}</CardTitle>
          <CardDescription>
            <p>{t("settings.ai.localLLMDescription")}</p>
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex gap-2">
          <AIModelSelect
            className="w-[70%]"
            onlyLocal
            value={currentModel}
            onValueChange={setCurrentModel}
            excludeLocalModels={models}
          />
          <Button variant="secondary" className="w-[30%]" onClick={handleAdd}>
            {loading ? t("common.cancel") : t("common.download")}
          </Button>
        </CardFooter>
        <CardContent>
          <ul>
            {models.map((model) => (
              <li
                className={cn(
                  "relative cursor-pointer rounded-sm p-2 hover:bg-secondary"
                )}
                key={model}
              >
                {model}
              </li>
            ))}
            {loading && (
              <li
                className={cn(
                  "relative cursor-pointer rounded-sm p-2 hover:bg-secondary"
                )}
              >
                {Boolean(currentModel && progress != 1) && (
                  <>
                    <div
                      className={cn(
                        "pointer-events-none absolute left-0 top-0 h-full bg-cyan-500 opacity-25 transition-all"
                      )}
                      style={{
                        width: `${progress * 100}%`,
                      }}
                    />
                    <span className="pointer-events-none absolute right-0 top-0 flex h-full items-center pr-2 ">
                      {(progress * 100).toFixed(2)}%
                    </span>
                  </>
                )}
                {currentModel}
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
