import { useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router-dom"

import { isDesktopMode } from "@/lib/env"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"
import { AIModelSelect } from "@/components/ai-chat/ai-chat-model-select"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/react-hook-form/form"

import { TaskType, useModelTest } from "./hooks"
import { LLMProviderManage } from "./llm-provider-manage"
import { LocalLLMManage } from "./local-llm-manage"
import { AIFormValues, aiFormSchema, useAIConfigStore } from "./store"

export function AIConfigForm() {
  const { setAiConfig, aiConfig } = useAIConfigStore()
  const form = useForm<AIFormValues>({
    resolver: zodResolver(aiFormSchema),
    defaultValues: aiConfig,
  })
  const { reset } = form
  const { testModel } = useModelTest()
  const { t } = useTranslation()
  const location = useLocation()

  useEffect(() => {
    reset(aiConfig)
  }, [aiConfig, reset])

  function onSubmit(data: AIFormValues) {
    console.log(data)
    setAiConfig(data)
    // data.token = "sk-**********"
    toast({
      title: t("settings.ai.configUpdated"),
    })
  }
  function updateModels(models: string[]) {
    form.setValue("localModels", models)
    form.trigger("localModels")
    onSubmit(form.getValues())
  }

  function updateProviders(providers: AIFormValues["llmProviders"]) {
    form.setValue("llmProviders", providers)
    form.trigger("llmProviders")
    onSubmit(form.getValues())
  }

  const getCardClassName = (cardId: string) => {
    return location.hash === `#${cardId}` ? "ring" : ""
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {!isDesktopMode && (
          <LocalLLMManage
            models={form.getValues("localModels")}
            setModels={updateModels}
          />
        )}
        <Card id="provider" className={getCardClassName("provider")}>
          <CardHeader>
            <CardTitle>{t("settings.ai.provider")}</CardTitle>
            <CardDescription>
              {t("settings.ai.providerDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="llmProviders"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormControl>
                    <LLMProviderManage {...field} onChange={updateProviders} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>
        <Card
          id="model-preferences"
          className={getCardClassName("model-preferences")}
        >
          <CardHeader>
            <CardTitle>{t("settings.ai.modelPreferences")}</CardTitle>
            <CardDescription>
              {t("settings.ai.modelPreferencesDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="embeddingModel"
              render={({ field }) => (
                <FormItem>
                  <div className="flex justify-between items-center">
                    <FormLabel className="w-1/3">
                      {t("settings.ai.embeddingModel")}
                    </FormLabel>
                    <div className="w-2/3 flex space-x-2">
                      <FormControl className="flex-grow">
                        <AIModelSelect
                          value={field.value ?? ""}
                          onValueChange={field.onChange}
                          localModels={aiConfig.localModels}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          testModel(TaskType.Embedding, field.value)
                        }
                      >
                        {t("common.test")}
                      </Button>
                    </div>
                  </div>
                  <FormDescription>
                    {t("settings.ai.embeddingModelDescription")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="translationModel"
              render={({ field }) => (
                <FormItem>
                  <div className="flex justify-between items-center">
                    <FormLabel className="w-1/3">
                      {t("settings.ai.translationModel")}
                    </FormLabel>
                    <div className="w-2/3 flex space-x-2">
                      <FormControl className="flex-grow">
                        <AIModelSelect
                          value={field.value ?? ""}
                          onValueChange={field.onChange}
                          onlyLocal={false}
                          localModels={aiConfig.localModels}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          testModel(TaskType.Translation, field.value)
                        }
                      >
                        {t("common.test")}
                      </Button>
                    </div>
                  </div>
                  <FormDescription>
                    {t("settings.ai.translationModelDescription")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="codingModel"
              render={({ field }) => (
                <FormItem>
                  <div className="flex justify-between items-center">
                    <FormLabel className="w-1/3">
                      {t("settings.ai.codingModel")}
                    </FormLabel>
                    <div className="w-2/3 flex space-x-2">
                      <FormControl className="flex-grow">
                        <AIModelSelect
                          value={field.value ?? ""}
                          onValueChange={field.onChange}
                          onlyLocal={false}
                          localModels={aiConfig.localModels}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => testModel(TaskType.Coding, field.value)}
                      >
                        {t("common.test")}
                      </Button>
                    </div>
                  </div>
                  <FormDescription>
                    {t("settings.ai.codingModelDescription")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>
        <Button type="submit">{t("common.update")}</Button>
      </form>
    </Form>
  )
}
