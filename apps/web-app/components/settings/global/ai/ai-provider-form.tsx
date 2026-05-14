import { useEffect, useMemo, useRef, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useDebounceFn } from "ahooks"
import { Loader2 } from "lucide-react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as z from "zod"

import type { LLMProvider } from "@/packages/ai/config"
import { llmProviderSchema as baseLlmProviderSchema } from "@/packages/ai/config"
import type { AvailableModel } from "@/packages/ai/helper"
import { LLM_PROVIDER_INFO, fetchAvailableModels } from "@/packages/ai/helper"
import { isDesktopMode } from "@/lib/env"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Tags,
  TagsContent,
  TagsEmpty,
  TagsGroup,
  TagsInput,
  TagsItem,
  TagsList,
  TagsTrigger,
  TagsValue,
} from "@/components/ui/kibo-ui/tags"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/use-toast"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/react-hook-form/form"

interface AIProviderFormProps {
  provider?: LLMProvider
  defaultValues?: Partial<LLMProvider>
  onSave: (provider: LLMProvider) => void
  onCancel?: () => void
  existingNames?: string[]
  isSubmitting?: boolean
}

export function AIProviderForm({
  provider,
  defaultValues,
  onSave,
  onCancel,
  existingNames = [],
  isSubmitting = false,
}: AIProviderFormProps) {
  const { t } = useTranslation()
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([])
  const [isFetchingModels, setIsFetchingModels] = useState(false)
  const [isManualMode, setIsManualMode] = useState(false)
  const [manualModelInput, setManualModelInput] = useState("")

  const llmProviderSchema = useMemo(() => {
    return baseLlmProviderSchema.refine(
      (data) => {
        if (data.type !== "openai-compatible" && data.type !== "ollama") {
          return true
        }
        const isEditing = !!provider
        const originalName = provider?.name
        const currentName = data.name

        const nameExists = existingNames
          .filter((name) => !isEditing || name !== originalName)
          .includes(currentName)

        return !nameExists
      },
      {
        message: t("settings.ai.providerNameUniqueError"),
        path: ["name"],
      }
    )
  }, [existingNames, provider, t])

  const form = useForm<LLMProvider>({
    resolver: zodResolver(llmProviderSchema),
    defaultValues: provider || {
      name: "",
      type: "openai",
      apiKey: "",
      baseUrl: "",
      models: "",
      enabled: true,
      ...defaultValues,
    },
  })
  const [hasChanges, setHasChanges] = useState(false)
  const initialValues = useRef(form.getValues())
  const providerInfo = LLM_PROVIDER_INFO[form.watch("type")]

  const watchedValues = form.watch()
  useEffect(() => {
    const initial = initialValues.current
    const changed = Object.keys(watchedValues).some(
      (key) =>
        watchedValues[key as keyof LLMProvider] !==
        initial[key as keyof LLMProvider]
    )
    setHasChanges(changed)
  }, [watchedValues])

  const selectedModelsString = form.watch("models")
  const selectedModelIds = useMemo(() => {
    return selectedModelsString
      ? selectedModelsString
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : []
  }, [selectedModelsString])

  const handleModelSelect = (modelId: string) => {
    if (selectedModelIds.includes(modelId)) return
    const newSelectedIds = [...selectedModelIds, modelId]
    form.setValue("models", newSelectedIds.join(","), {
      shouldValidate: true,
      shouldDirty: true,
    })
  }

  const handleModelRemove = (modelId: string) => {
    const newSelectedIds = selectedModelIds.filter((id) => id !== modelId)
    form.setValue("models", newSelectedIds.join(","), {
      shouldValidate: true,
      shouldDirty: true,
    })
  }

  const handleManualModelAdd = () => {
    const trimmedInput = manualModelInput.trim()
    if (!trimmedInput || selectedModelIds.includes(trimmedInput)) {
      setManualModelInput("")
      return
    }

    const newSelectedIds = [...selectedModelIds, trimmedInput]
    form.setValue("models", newSelectedIds.join(","), {
      shouldValidate: true,
      shouldDirty: true,
    })
    setManualModelInput("")
  }

  const handleManualInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleManualModelAdd()
    }
  }

  function onSubmit(data: LLMProvider) {
    onSave(data)
  }

  const baseUrl = form.watch("baseUrl")
  const apiKey = form.watch("apiKey")
  const providerType = form.watch("type")

  const { run: fetchModels } = useDebounceFn(
    async () => {
      if (!apiKey && providerType !== "ollama") return

      setIsFetchingModels(true)
      setAvailableModels([])

      try {
        const models = isDesktopMode
          ? await window.eidos
              .fetchAvailableModels(
                apiKey || "key for ollama",
                providerType,
                baseUrl
              )
              .then((result) => (result.success ? result.models || [] : []))
          : await fetchAvailableModels(
              apiKey || "key for ollama",
              providerType,
              baseUrl
            )
        setAvailableModels(models)
      } catch (error) {
        console.error(error)
        setAvailableModels([])
        toast({
          title: t("common.error"),
          description: t("settings.ai.fetchModelListError"),
        })
      } finally {
        setIsFetchingModels(false)
      }
    },
    { wait: 500 }
  )

  // Automatically set apiKey for ollama
  useEffect(() => {
    if (providerType === "ollama") {
      form.setValue("apiKey", "ollama", {
        shouldValidate: false,
        shouldDirty: false,
      })
    }
  }, [providerType, form])

  async function getModelList(
    e?: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) {
    e?.preventDefault()
    fetchModels()
  }

  useEffect(() => {
    // Fetch models automatically for ollama or other providers when apiKey is present
    if (
      providerType === "ollama" ||
      (providerType !== "openai-compatible" && apiKey)
    ) {
      fetchModels()
    }
  }, [providerType, apiKey, baseUrl, fetchModels])

  const isEditing = !!provider

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Provider Type Selection */}
          <div className="space-y-4">
            <div className="space-y-0.5">
              <Label>{t("settings.ai.providerType")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.ai.providerTypeDescription")}
              </p>
            </div>
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <select
                      className="w-full h-7 px-1 border rounded-md bg-background"
                      {...field}
                    >
                      {Object.entries(LLM_PROVIDER_INFO).map(([type, info]) => (
                        <option key={type} value={type}>
                          {info.name}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Name Field (for openai-compatible and ollama) */}
          {(form.watch("type") === "openai-compatible" ||
            form.watch("type") === "ollama") && (
            <div className="space-y-4">
              <div className="space-y-0.5">
                <Label>{t("common.name")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("settings.ai.providerNameDescription")}
                </p>
              </div>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t("settings.ai.providerNamePlaceholder")}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}

          {/* Base URL Field (for openai-compatible and ollama) */}
          {(form.watch("type") === "openai-compatible" ||
            form.watch("type") === "ollama") && (
            <div className="space-y-4">
              <div className="space-y-0.5">
                <Label>{t("settings.ai.baseUrl")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("settings.ai.baseUrlDescription")}
                </p>
              </div>
              <FormField
                name="baseUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={
                          providerInfo?.baseUrl || "https://api.openai.com/v1"
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}

          {/* API Version Field (for openai and openai-compatible) */}
          {(form.watch("type") === "openai" ||
            form.watch("type") === "openai-compatible") && (
            <div className="space-y-4">
              <div className="space-y-0.5">
                <Label>{t("settings.ai.apiVersion")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("settings.ai.apiVersionDescription")}
                </p>
              </div>
              <FormField
                control={form.control}
                name="apiVersion"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <select
                        className="w-full h-7 px-1 border rounded-md bg-background"
                        {...field}
                      >
                        <option value="chat">
                          {t("settings.ai.apiVersionChat")}
                        </option>
                        <option value="responses">
                          {t("settings.ai.apiVersionResponses")}
                        </option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}

          {/* API Key Field (for non-ollama providers) */}
          {form.watch("type") !== "ollama" && (
            <div className="space-y-4">
              <div className="space-y-0.5">
                <Label>{t("common.apiKey")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("settings.ai.apiKeyDescription")}
                  {providerInfo?.urlForGettingApiKey && (
                    <span className="ml-1">
                      (
                      <a
                        href={providerInfo.urlForGettingApiKey}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        {t("settings.ai.getApiKeyHint")}
                      </a>
                      )
                    </span>
                  )}
                </p>
              </div>
              <FormField
                name="apiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input {...field} type="password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}

          {/* Models Selection */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t("settings.ai.models")}</Label>
                <p className="text-sm text-muted-foreground">
                  {isManualMode
                    ? t("settings.ai.modelsDescriptionManual")
                    : t("settings.ai.modelsDescription")}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                {(form.watch("type") === "openai-compatible" ||
                  form.watch("type") === "ollama") && (
                  <>
                    <span className="text-xs text-muted-foreground">
                      {isManualMode
                        ? t("settings.ai.manualEntry")
                        : t("settings.ai.autoFetch")}
                    </span>
                    <Switch
                      checked={isManualMode}
                      onCheckedChange={setIsManualMode}
                    />
                    {!isManualMode && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={getModelList}
                        disabled={
                          isFetchingModels ||
                          (!form.watch("apiKey") &&
                            form.watch("type") !== "ollama")
                        }
                      >
                        {isFetchingModels ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        {t("common.fetch")}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
            <FormField
              control={form.control}
              name="models"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    {isManualMode ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1 mb-2">
                          {selectedModelIds.map((modelId) => (
                            <TagsValue
                              key={modelId}
                              onRemove={() => handleModelRemove(modelId)}
                            >
                              {modelId}
                            </TagsValue>
                          ))}
                        </div>
                        <div className="flex space-x-2">
                          <Input
                            placeholder={t("settings.ai.enterModelName")}
                            value={manualModelInput}
                            onChange={(e) =>
                              setManualModelInput(e.target.value)
                            }
                            onKeyDown={handleManualInputKeyDown}
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            onClick={handleManualModelAdd}
                            disabled={!manualModelInput.trim()}
                          >
                            {t("common.add")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Tags className="w-full">
                        <TagsTrigger className="min-h-[40px] items-start">
                          {selectedModelIds.map((modelId) => (
                            <TagsValue
                              key={modelId}
                              onRemove={() => handleModelRemove(modelId)}
                            >
                              {availableModels.find((m) => m.id === modelId)
                                ?.label || modelId}
                            </TagsValue>
                          ))}
                        </TagsTrigger>
                        <TagsContent>
                          <TagsInput
                            placeholder={t("settings.ai.searchModels")}
                          />
                          <TagsList>
                            <TagsEmpty>
                              {t("settings.ai.noModelsFound")}
                            </TagsEmpty>
                            <TagsGroup>
                              {availableModels
                                .filter(
                                  (model) =>
                                    !selectedModelIds.includes(model.id)
                                )
                                .map((model) => (
                                  <TagsItem
                                    key={model.id}
                                    value={model.id}
                                    onSelect={() => handleModelSelect(model.id)}
                                  >
                                    {model.label}
                                  </TagsItem>
                                ))}
                            </TagsGroup>
                            {isFetchingModels && (
                              <div className="p-2 text-center text-sm text-muted-foreground">
                                <Loader2 className="mr-2 h-4 w-4 animate-spin inline-block" />
                                {t("common.loading")}...
                              </div>
                            )}
                          </TagsList>
                        </TagsContent>
                      </Tags>
                    )}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2">
            {hasChanges ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  form.reset()
                  setHasChanges(false)
                }}
                disabled={isSubmitting}
              >
                {t("common.reset")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                {t("common.cancel")}
              </Button>
            )}
            <Button
              type="submit"
              disabled={(isEditing && !hasChanges) || isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {isEditing ? t("common.update") : t("common.add")}
            </Button>
          </div>
        </form>
      </Form>
    </>
  )
}
