import { Suspense, useCallback, useEffect, useState } from "react"
import type { LLMProvider } from "@/packages/ai/config"
import {
  ALL_PROVIDERS,
  LLM_PROVIDER_INFO,
  type LLMProviderType,
} from "@/packages/ai/helper"
import {
  Edit,
  Plus,
  Trash2,
  AlertTriangle,
  Bot,
  Sparkles,
  Globe,
  MessageCircle,
  ThumbsUp,
  X,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/use-toast"
import { useAIConfigStore } from "@/components/settings/stores"
import { isDesktopMode } from "@/lib/env"

import { AIProviderForm } from "./ai/ai-provider-form"
import { AITaskConfigForm } from "./ai/ai-task-form"
import ProviderIcon from "./ai/provider-icon"

function formatProviderName(type: string) {
  return type
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

export function GlobalAISettings() {
  const { t } = useTranslation()
  const { aiConfig, addLLMProvider, updateLLMProvider, removeLLMProvider } =
    useAIConfigStore()
  const [showProviderForm, setShowProviderForm] = useState(false)
  const [editingProvider, setEditingProvider] = useState<
    LLMProvider | undefined
  >()
  const [defaultProviderValues, setDefaultProviderValues] = useState<
    Partial<LLMProvider> | undefined
  >()
  const [isFormDirty, setIsFormDirty] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [addPopoverOpen, setAddPopoverOpen] = useState(false)
  const [providerToDelete, setProviderToDelete] = useState<string | null>(null)
  const [spaceList, setSpaceList] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    if (isDesktopMode && window.eidos?.spaceMgmt) {
      window.eidos.spaceMgmt
        .listSpaces()
        .then((spaces: any[]) => {
          setSpaceList(spaces.map((s) => ({ id: s.id, name: s.name })))
        })
        .catch(() => {})
    }
  }, [])

  const [telegramRunning, setTelegramRunning] = useState(false)
  const checkChannelStatus = useCallback(async () => {
    if (!isDesktopMode || !aiConfig.channels?.telegram?.enabled) return
    try {
      const status = await window.eidos.agentChannel.getStatus()
      setTelegramRunning(status.telegram.running)
    } catch {
      setTelegramRunning(false)
    }
  }, [aiConfig.channels?.telegram?.enabled])

  useEffect(() => {
    checkChannelStatus()
    const interval = setInterval(checkChannelStatus, 5000)
    return () => clearInterval(interval)
  }, [checkChannelStatus])

  const configuredProviderTypes = new Set<LLMProviderType>(
    aiConfig.llmProviders.map((p) => p.type)
  )

  const RECOMMENDED_PROVIDERS: LLMProviderType[] = ["opencode-go", "deepseek"]
  const regularProviders = ALL_PROVIDERS.filter(
    (p) => !RECOMMENDED_PROVIDERS.includes(p)
  ).sort((a, b) => {
    if (a === "openai-compatible") return -1
    if (b === "openai-compatible") return 1
    return 0
  })

  const handleAddProvider = (providerType: LLMProviderType) => {
    const existingProviders = aiConfig.llmProviders.filter(
      (p) => p.type === providerType
    )
    let newProviderName: string = providerType
    let count = 1
    while (
      aiConfig.llmProviders.some((p) => p.name === newProviderName) ||
      existingProviders.some((p) => p.name === newProviderName)
    ) {
      newProviderName = `${providerType}-${count}`
      count++
    }

    setEditingProvider(undefined)
    setDefaultProviderValues({
      type: providerType,
      name: newProviderName,
      apiKey: "",
      baseUrl: providerType === "ollama" ? "http://localhost:11434/v1" : "",
      models: "",
      apiVersion: "chat",
      enabled: true,
    })
    setShowProviderForm(true)
  }

  const handleEditProvider = (provider: LLMProvider) => {
    setEditingProvider(provider)
    setDefaultProviderValues(undefined)
    setShowProviderForm(true)
  }

  const handleSaveProvider = async (provider: LLMProvider) => {
    try {
      const existingProvider = aiConfig.llmProviders.find(
        (p) => p.name === provider.name
      )

      if (existingProvider) {
        updateLLMProvider(provider)
        toast({
          title: t("common.success"),
          description: t("settings.ai.providerUpdatedSuccess", {
            name: provider.name,
          }),
        })
      } else {
        addLLMProvider(provider)
        toast({
          title: t("common.success"),
          description: t("settings.ai.providerAddedSuccess", {
            name: provider.name,
          }),
        })
      }
      setShowProviderForm(false)
      setEditingProvider(undefined)
      setDefaultProviderValues(undefined)
    } catch (error) {
      toast({
        title: t("common.error"),
        description: t("settings.ai.providerSaveError"),
        variant: "destructive",
      })
    }
  }

  const handleCancelForm = () => {
    setShowProviderForm(false)
    setEditingProvider(undefined)
    setDefaultProviderValues(undefined)
  }

  const handleDeleteProvider = (providerName: string) => {
    setProviderToDelete(providerName)
    setIsDeleteDialogOpen(true)
  }

  const confirmDeleteProvider = async () => {
    if (!providerToDelete) return

    try {
      removeLLMProvider(providerToDelete)
      toast({
        title: t("common.success"),
        description: t("settings.ai.providerDeletedSuccess", {
          name: providerToDelete,
        }),
      })
    } catch (error) {
      toast({
        title: t("common.error"),
        description: t("settings.ai.providerDeleteError"),
        variant: "destructive",
      })
    } finally {
      setIsDeleteDialogOpen(false)
      setProviderToDelete(null)
    }
  }

  return (
    <div className="space-y-0">
      {/* Provider Section */}
      <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-medium">{t("settings.ai.provider")}</h3>
        </div>
        {aiConfig.llmProviders.length > 0 && (
          <Popover open={addPopoverOpen} onOpenChange={setAddPopoverOpen}>
            <PopoverTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                {t("common.button.add")}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" side="bottom" className="w-72 p-0">
              <Command>
                <CommandInput placeholder={t("common.search") ?? "Search..."} />
                <CommandList>
                  <CommandEmpty>
                    {t("common.noResults", "No results")}
                  </CommandEmpty>
                  <CommandGroup
                    heading={t("settings.ai.recommended", "Recommended")}
                  >
                    {RECOMMENDED_PROVIDERS.map((type) => (
                      <CommandItem
                        key={type}
                        onSelect={() => {
                          handleAddProvider(type)
                          setAddPopoverOpen(false)
                        }}
                        disabled={
                          type !== "openai-compatible" &&
                          type !== "ollama" &&
                          configuredProviderTypes.has(type)
                        }
                      >
                        <ProviderIcon type={type} />
                        <span>
                          {LLM_PROVIDER_INFO[type]?.name ??
                            formatProviderName(type)}
                        </span>
                        <ThumbsUp className="ml-auto h-3.5 w-3.5 text-amber-500" />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandGroup
                    heading={t("settings.ai.allProviders", "All Providers")}
                  >
                    {regularProviders.map((type) => (
                      <CommandItem
                        key={type}
                        onSelect={() => {
                          handleAddProvider(type)
                          setAddPopoverOpen(false)
                        }}
                        disabled={
                          type !== "openai-compatible" &&
                          type !== "ollama" &&
                          configuredProviderTypes.has(type)
                        }
                      >
                        <ProviderIcon type={type} />
                        <span>
                          {LLM_PROVIDER_INFO[type]?.name ??
                            formatProviderName(type)}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("settings.ai.providerDescription")}
          </p>

          {/* Inline provider form */}
          {showProviderForm && (
            <div className="rounded-lg border border-primary/30 bg-muted/30 p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-medium">
                  {editingProvider
                    ? t("settings.ai.editProvider")
                    : t("settings.ai.addProvider")}
                </h4>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleCancelForm}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <AIProviderForm
                provider={editingProvider}
                defaultValues={defaultProviderValues}
                onSave={handleSaveProvider}
                onCancel={handleCancelForm}
                existingNames={aiConfig.llmProviders.map((p) => p.name)}
              />
            </div>
          )}

          {/* Provider list (newest first) */}
          {aiConfig.llmProviders.length === 0 && !showProviderForm ? (
            <div className="p-8 text-center border border-dashed rounded-lg">
              <Bot className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground mb-1">
                {t("settings.ai.noProviders", "No providers configured")}
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                {t(
                  "settings.ai.addProviderHint",
                  "Add an LLM provider to start using AI features"
                )}
              </p>
              <Popover open={addPopoverOpen} onOpenChange={setAddPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    {t("settings.ai.addProvider", "Add Provider")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="center"
                  side="bottom"
                  className="w-72 p-0"
                >
                  <Command>
                    <CommandInput
                      placeholder={t("common.search") ?? "Search..."}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {t("common.noResults", "No results")}
                      </CommandEmpty>
                      <CommandGroup
                        heading={t("settings.ai.recommended", "Recommended")}
                      >
                        {RECOMMENDED_PROVIDERS.map((type) => (
                          <CommandItem
                            key={type}
                            onSelect={() => {
                              handleAddProvider(type)
                              setAddPopoverOpen(false)
                            }}
                            disabled={
                              type !== "openai-compatible" &&
                              type !== "ollama" &&
                              configuredProviderTypes.has(type)
                            }
                          >
                            <ProviderIcon type={type} />
                            <span>
                              {LLM_PROVIDER_INFO[type]?.name ??
                                formatProviderName(type)}
                            </span>
                            <ThumbsUp className="ml-auto h-3.5 w-3.5 text-amber-500" />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      <CommandGroup
                        heading={t("settings.ai.allProviders", "All Providers")}
                      >
                        {regularProviders.map((type) => (
                          <CommandItem
                            key={type}
                            onSelect={() => {
                              handleAddProvider(type)
                              setAddPopoverOpen(false)
                            }}
                            disabled={
                              type !== "openai-compatible" &&
                              type !== "ollama" &&
                              configuredProviderTypes.has(type)
                            }
                          >
                            <ProviderIcon type={type} />
                            <span>
                              {LLM_PROVIDER_INFO[type]?.name ??
                                formatProviderName(type)}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          ) : (
            <div className="space-y-3">
              {[...aiConfig.llmProviders].reverse().map((provider) => {
                const models = provider.models
                  ? provider.models.split(",").map((m) => m.trim())
                  : []
                const displayModels = models.slice(0, 3)
                const remainingCount = models.length - 3

                return (
                  <div
                    key={provider.name}
                    className="p-4 rounded-lg border hover:border-primary/50 transition-colors"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {/* Icon & Name */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-md bg-muted shrink-0">
                          <Suspense fallback={<div className="w-4 h-4" />}>
                            <ProviderIcon type={provider.type} />
                          </Suspense>
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">
                            {provider.name}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {provider.type}
                          </p>
                        </div>
                      </div>

                      {/* Models */}
                      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                        {models.length > 0 ? (
                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                            {displayModels.map((model) => (
                              <Badge
                                key={model}
                                variant="secondary"
                                className="text-xs font-normal"
                              >
                                {model}
                              </Badge>
                            ))}
                            {remainingCount > 0 && (
                              <span className="text-xs text-muted-foreground">
                                +{remainingCount}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            {t("settings.ai.noModelsConfigured")}
                          </span>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEditProvider(provider)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleDeleteProvider(provider.name)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Model Preferences Section */}
      <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-medium">
            {t("settings.ai.modelPreferences")}
          </h3>
        </div>
        <Button
          size="sm"
          disabled={!isFormDirty}
          className="transition-opacity duration-200"
          style={{
            opacity: isFormDirty ? 1 : 0,
            pointerEvents: isFormDirty ? "auto" : "none",
          }}
          onClick={() => {
            // Trigger form submission
            const form = document.querySelector("form")
            if (form) {
              form.requestSubmit()
            }
          }}
        >
          {t("common.update")}
        </Button>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <AITaskConfigForm onDirtyChange={setIsFormDirty} />
      </div>

      {/* Agent Section */}
      <div className="py-4 flex items-center gap-2">
        <Bot className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-medium">{t("settings.ai.agent")}</h3>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-start gap-4">
            <div className="space-y-0.5 flex-1 min-w-0">
              <label className="text-sm font-medium">
                {t("settings.ai.agentNotificationSound")}
              </label>
              <p className="text-sm text-muted-foreground">
                {t("settings.ai.agentNotificationSoundDescription")}
              </p>
            </div>
            <div className="flex-shrink-0">
              <Switch
                checked={aiConfig.agentNotificationSound ?? true}
                onCheckedChange={(checked) => {
                  useAIConfigStore.getState().setAiConfig({
                    ...aiConfig,
                    agentNotificationSound: checked,
                  })
                }}
              />
            </div>
          </div>
          <div className="flex flex-col lg:flex-row lg:items-start gap-4">
            <div className="space-y-0.5 flex-1 min-w-0">
              <label className="text-sm font-medium">
                {t("settings.ai.agentPermissionBypass")}
              </label>
              <p className="text-sm text-muted-foreground">
                {t("settings.ai.agentPermissionBypassDescription")}
              </p>
            </div>
            <div className="flex-shrink-0">
              <Switch
                checked={aiConfig.agentPermissionBypass ?? false}
                onCheckedChange={(checked) => {
                  useAIConfigStore.getState().setAiConfig({
                    ...aiConfig,
                    agentPermissionBypass: checked,
                  })
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tool API Keys Section */}
      <div className="py-4 flex items-center gap-2">
        <Globe className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-medium">Tool API Keys</h3>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-start gap-4">
            <div className="space-y-0.5 flex-1 min-w-0">
              <label className="text-sm font-medium">Exa API Key</label>
              <p className="text-sm text-muted-foreground">
                Used for web search. Get your key at{" "}
                <a
                  href="https://exa.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  exa.ai
                </a>
              </p>
            </div>
            <div className="w-full lg:w-80 flex-shrink-0">
              <Input
                type="password"
                placeholder="Enter your Exa API key"
                defaultValue={aiConfig.exaApiKey ?? ""}
                onBlur={(e) => {
                  const val = e.target.value.trim()
                  if (val !== (aiConfig.exaApiKey ?? "")) {
                    useAIConfigStore.getState().setAiConfig({
                      ...aiConfig,
                      exaApiKey: val || undefined,
                    })
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Channels Section */}
      <div className="py-4 flex items-center gap-2">
        <MessageCircle className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-medium">{t("settings.ai.channels")}</h3>
      </div>

      <hr className="border-border" />

      {!isDesktopMode && (
        <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-md flex gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            {t("settings.account.desktopOnly")}
          </p>
        </div>
      )}

      <div className="py-6">
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {t("settings.ai.channelsDescription")}
          </p>

          {/* Telegram Channel Group */}
          <div className="rounded-xl border border-border bg-card/50 p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-sky-500/10 flex items-center justify-center">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-6 w-6 text-sky-500 fill-current"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M11.944 0C5.352 0 0 5.352 0 11.944c0 6.592 5.352 11.944 11.944 11.944 6.592 0 11.944-5.352 11.944-11.944C23.888 5.352 18.536 0 11.944 0zm5.824 8.048l-2.016 9.488c-.144.672-.544.832-1.12.512l-3.088-2.272-1.488 1.44c-.16.16-.304.304-.624.304l.224-3.184 5.808-5.248c.256-.224-.048-.352-.384-.128L7.96 13.136l-3.088-.96c-.672-.208-.688-.672.144-.992l12.064-4.656c.56-.208 1.04.128.864.72z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-base font-semibold">Telegram</h4>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.ai.telegramDescription")
                      .split("@BotFather")
                      .map((part, i, arr) => (
                        <span key={i}>
                          {part}
                          {i < arr.length - 1 && (
                            <a
                              href="https://t.me/BotFather"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline text-sky-500 hover:text-sky-600 font-medium"
                            >
                              @BotFather
                            </a>
                          )}
                        </span>
                      ))}
                  </p>
                </div>
              </div>
              <Switch
                checked={aiConfig.channels?.telegram?.enabled ?? false}
                onCheckedChange={(checked) => {
                  useAIConfigStore.getState().setAiConfig({
                    ...aiConfig,
                    channels: {
                      ...aiConfig.channels,
                      telegram: {
                        ...aiConfig.channels?.telegram,
                        enabled: checked,
                      },
                    },
                  })
                }}
              />
            </div>

            <div className="space-y-4">
              {/* Telegram Bot Token */}
              <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                <div className="space-y-0.5 flex-1 min-w-0">
                  <label className="text-sm font-medium">
                    {t("settings.ai.telegramBotToken")}
                  </label>
                  <p className="text-sm text-muted-foreground">
                    {t("settings.ai.telegramBotTokenDescription")}
                  </p>
                </div>
                <div className="w-full lg:w-80 flex-shrink-0">
                  <Input
                    type="password"
                    placeholder="123456:ABC-DEF..."
                    defaultValue={aiConfig.channels?.telegram?.botToken ?? ""}
                    onBlur={(e) => {
                      const val = e.target.value.trim()
                      if (
                        val !== (aiConfig.channels?.telegram?.botToken ?? "")
                      ) {
                        useAIConfigStore.getState().setAiConfig({
                          ...aiConfig,
                          channels: {
                            ...aiConfig.channels,
                            telegram: {
                              enabled: false,
                              ...aiConfig.channels?.telegram,
                              botToken: val || undefined,
                            },
                          },
                        })
                      }
                    }}
                  />
                </div>
              </div>

              {/* Default Space */}
              <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                <div className="space-y-0.5 flex-1 min-w-0">
                  <label className="text-sm font-medium">
                    {t("settings.ai.defaultSpace")}
                  </label>
                  <p className="text-sm text-muted-foreground">
                    {t("settings.ai.defaultSpaceDescription")}
                  </p>
                </div>
                <div className="w-full lg:w-80 flex-shrink-0">
                  <Select
                    value={aiConfig.channels?.telegram?.defaultSpace ?? ""}
                    onValueChange={(val) => {
                      useAIConfigStore.getState().setAiConfig({
                        ...aiConfig,
                        channels: {
                          ...aiConfig.channels,
                          telegram: {
                            enabled: !!aiConfig.channels?.telegram?.enabled,
                            ...aiConfig.channels?.telegram,
                            defaultSpace: val || undefined,
                          },
                        },
                      })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a space" />
                    </SelectTrigger>
                    <SelectContent>
                      {spaceList.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Default Model */}
              <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                <div className="space-y-0.5 flex-1 min-w-0">
                  <label className="text-sm font-medium">
                    {t("settings.ai.defaultModel")}
                  </label>
                  <p className="text-sm text-muted-foreground">
                    {t("settings.ai.defaultModelDescription")}
                  </p>
                </div>
                <div className="w-full lg:w-80 flex-shrink-0">
                  <Select
                    value={aiConfig.channels?.telegram?.defaultModel ?? ""}
                    onValueChange={(val) => {
                      useAIConfigStore.getState().setAiConfig({
                        ...aiConfig,
                        channels: {
                          ...aiConfig.channels,
                          telegram: {
                            ...aiConfig.channels?.telegram,
                            enabled:
                              aiConfig.channels?.telegram?.enabled ?? false,
                            defaultModel: val,
                          },
                        },
                      })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {aiConfig.llmProviders
                        .filter((p) => p.enabled !== false)
                        .flatMap((p) =>
                          (p.models ?? "")
                            .split(",")
                            .map((m) => m.trim())
                            .filter(Boolean)
                            .map((m) => ({
                              label: `${m} (${p.name})`,
                              value: `${m}@${p.name}`,
                            }))
                        )
                        .map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Status */}
              {aiConfig.channels?.telegram?.enabled && (
                <div className="flex items-center gap-2 text-sm pt-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      telegramRunning
                        ? "bg-green-500 animate-pulse"
                        : "bg-yellow-500"
                    }`}
                  />
                  <span className="text-muted-foreground">
                    {telegramRunning
                      ? t("settings.ai.botStatusRunning")
                      : t("settings.ai.botStatusConfigured")}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t("settings.ai.deleteProviderTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.ai.deleteProviderDescription", {
                name: providerToDelete,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteProvider}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
