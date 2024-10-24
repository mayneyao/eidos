import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import OpenAI from "openai"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/react-hook-form/form"

import { LLMProvider, llmProviderSchema } from "./store"

interface ILLMProviderManageProps {
  onAdd: (data: LLMProvider) => void
}

export const UpdateLLMProviderForm = ({
  value,
  onChange,
  children,
}: LLMProviderFormProps & {
  children?: React.ReactNode
}) => {
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()
  const handleChange = (data: LLMProvider) => {
    onChange?.(data)
    setOpen(false)
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("settings.ai.updateLLMProvider")}</DialogTitle>
        </DialogHeader>
        <LLMProviderForm value={value} onChange={handleChange} />
      </DialogContent>
    </Dialog>
  )
}

export const NewLLMProviderForm = ({ onAdd }: ILLMProviderManageProps) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const handleAdd = (data: LLMProvider) => {
    onAdd(data)
    setOpen(false)
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          {t("settings.ai.addProvider")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("settings.ai.addProvider")}</DialogTitle>
          <DialogDescription>
            {t("settings.ai.addProviderDescription")}
          </DialogDescription>
        </DialogHeader>
        <LLMProviderForm onAdd={handleAdd} />
      </DialogContent>
    </Dialog>
  )
}

interface LLMProviderFormProps {
  value?: LLMProvider
  onChange?: (value: LLMProvider) => void
  onAdd?: (data: LLMProvider) => void
}

export const LLMProviderForm = ({
  onAdd,
  value,
  onChange,
}: LLMProviderFormProps) => {
  const { t } = useTranslation()
  const form = useForm<LLMProvider>({
    resolver: zodResolver(llmProviderSchema),
    defaultValues: value || {
      name: "",
      type: "openai",
      apiKey: "",
      baseUrl: "",
      models: "",
    },
  })
  const toast = useToast()

  function onSubmit(data: LLMProvider) {
    onChange ? onChange(data) : onAdd?.(data)
  }

  function handleSubmit() {
    const data = form.getValues()
    onSubmit(data)
  }

  async function getModelList(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) {
    e.preventDefault()
    const baseUrl = form.getValues("baseUrl")
    if (!baseUrl) {
      toast.toast({
        title: t("common.error"),
        description: t("settings.ai.baseUrlRequired"),
      })
      return
    }
    const openai = new OpenAI({
      apiKey: form.getValues("apiKey"),
      baseURL: baseUrl,
      dangerouslyAllowBrowser: true,
    })
    try {
      const resp = await openai.models.list()
      const modelIds = resp.data.map((model) => model.id).join(", ")
      form.setValue("models", modelIds)
      // focus on models input
      form.setFocus("models")
    } catch (error) {
      console.error(error)
      toast.toast({
        title: t("common.error"),
        description: t("settings.ai.fetchModelListError"),
      })
    }
  }

  const mode = onChange ? "Update" : "Add"

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("common.name")}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoComplete="off"
                  placeholder="openai/ollama/groq/moonshoot..."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("settings.ai.providerType")}</FormLabel>
              <FormControl>
                <Select
                  {...field}
                  onValueChange={(value) => {
                    form.setValue("type", value as any)
                  }}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder={t("settings.ai.providerType")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="google">Google</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {
          // only show the following fields if the type is openai
          form.watch("type") === "openai" && (
            <FormField
              name="baseUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.ai.baseUrl")}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="https://api.openai.com/v1" />
                  </FormControl>
                  <FormDescription>
                    {t("settings.ai.baseUrlDescription")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )
        }
        <FormField
          name="apiKey"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("common.apiKey")}</FormLabel>
              <FormControl>
                <Input {...field} type="password" />
              </FormControl>
              <FormDescription>
                {t("settings.ai.apiKeyDescription")}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="models"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>{t("settings.ai.models")}</FormLabel>
                {form.watch("type") === "openai" && (
                  <Button size="xs" variant="outline" onClick={getModelList}>
                    {t("common.fetch")}
                  </Button>
                )}
              </div>
              <FormControl>
                <Input
                  {...field}
                  placeholder="llama3-70b-8192,mixtral-8x7b-32768"
                />
              </FormControl>
              <FormDescription>
                {t("settings.ai.modelsDescription")}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button onClick={handleSubmit}>{mode}</Button>
      </form>
    </Form>
  )
}
