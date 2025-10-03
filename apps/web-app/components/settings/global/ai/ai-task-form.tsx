import { aiFormSchema, type AIFormValues } from "@/packages/ai/config"
import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router-dom"

import { useAIConfigStore } from "@/components/settings/stores"
import { AIModelSelect } from "@/components/ai-chat/ai-chat-model-select"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/react-hook-form/form"

import { TaskType } from "./hooks"
import { ModelTestButton } from "./model-test-button"

export function AITaskConfigForm({
  onDirtyChange,
}: { onDirtyChange?: (isDirty: boolean) => void } = {}) {
  const { setAiConfig, aiConfig } = useAIConfigStore()
  const form = useForm<AIFormValues>({
    resolver: zodResolver(aiFormSchema),
    defaultValues: aiConfig,
  })
  const { reset } = form
  const { t } = useTranslation()
  const location = useLocation()
  const { isDirty } = form.formState

  useEffect(() => {
    reset(aiConfig)
  }, [aiConfig, reset])

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  function onSubmit(data: AIFormValues) {
    setAiConfig(data)
    // data.token = "sk-**********"
  }
  function updateModels(models: string[]) {
    form.setValue("localModels", models)
    form.trigger("localModels")
    onSubmit(form.getValues())
  }

  // function updateProviders(providers: AIFormValues["llmProviders"]) {
  //   form.setValue("llmProviders", providers)
  //   form.trigger("llmProviders")
  //   onSubmit(form.getValues())
  // }

  const getCardClassName = (cardId: string) => {
    return location.hash === `#${cardId}` ? "ring" : ""
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-0.5">
          <p className="text-sm text-muted-foreground">
            {t("settings.ai.modelPreferencesDescription")}
          </p>
        </div>

        <div className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-start gap-4">
            <div className="space-y-0.5 flex-1 min-w-0">
              <FormLabel>{t("settings.ai.translationModel")}</FormLabel>
              <p className="text-sm text-muted-foreground">
                {t("settings.ai.translationModelDescription")}
              </p>
            </div>
            <div className="w-full lg:w-64 flex-shrink-0">
              <FormField
                control={form.control}
                name="translationModel"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center space-x-2">
                      <FormControl className="w-full">
                        <AIModelSelect
                          value={field.value ?? ""}
                          onValueChange={field.onChange}
                          onlyLocal={false}
                          localModels={aiConfig.localModels}
                        />
                      </FormControl>
                      <ModelTestButton
                        taskType={TaskType.Translation}
                        modelValue={field.value}
                      />
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-start gap-4">
            <div className="space-y-0.5 flex-1 min-w-0">
              <FormLabel>{t("settings.ai.codingModel")}</FormLabel>
              <p className="text-sm text-muted-foreground">
                {t("settings.ai.codingModelDescription")}
              </p>
            </div>
            <div className="w-full lg:w-64 flex-shrink-0">
              <FormField
                control={form.control}
                name="codingModel"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center space-x-2">
                      <FormControl className="w-full">
                        <AIModelSelect
                          value={field.value ?? ""}
                          onValueChange={field.onChange}
                          onlyLocal={false}
                          localModels={aiConfig.localModels}
                        />
                      </FormControl>
                      <ModelTestButton
                        taskType={TaskType.Coding}
                        modelValue={field.value}
                      />
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-start gap-4">
            <div className="space-y-0.5 flex-1 min-w-0">
              <FormLabel>{t("settings.ai.applyCodeModel")}</FormLabel>
              <p className="text-sm text-muted-foreground">
                {t("settings.ai.applyCodeModelDescription")}
              </p>
            </div>
            <div className="w-full lg:w-64 flex-shrink-0">
              <FormField
                control={form.control}
                name="applyCodeModel"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center space-x-2">
                      <FormControl className="w-full">
                        <AIModelSelect
                          value={field.value ?? ""}
                          onValueChange={field.onChange}
                          onlyLocal={false}
                          localModels={aiConfig.localModels}
                        />
                      </FormControl>
                      <ModelTestButton
                        taskType={TaskType.ApplyCode}
                        modelValue={field.value}
                      />
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-start gap-4">
            <div className="space-y-0.5 flex-1 min-w-0">
              <FormLabel>{t("settings.ai.embeddingModel")}</FormLabel>
              <p className="text-sm text-muted-foreground">
                {t("settings.ai.embeddingModelDescription")}
              </p>
            </div>
            <div className="w-full lg:w-64 flex-shrink-0">
              <FormField
                control={form.control}
                name="embeddingModel"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center space-x-2">
                      <FormControl className="w-full">
                        <AIModelSelect
                          value={field.value ?? ""}
                          onValueChange={field.onChange}
                          localModels={aiConfig.localModels}
                        />
                      </FormControl>
                      <ModelTestButton
                        taskType={TaskType.Embedding}
                        modelValue={field.value}
                      />
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </div>
      </form>
    </Form>
  )
}
