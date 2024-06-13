import { useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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

  useEffect(() => {
    reset(aiConfig)
  }, [aiConfig, reset])

  function onSubmit(data: AIFormValues) {
    console.log(data)
    setAiConfig(data)
    // data.token = "sk-**********"
    toast({
      title: "AI Config updated.",
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <LocalLLMManage
          models={form.getValues("localModels")}
          setModels={updateModels}
        />
        <Card>
          <CardHeader>
            <CardTitle>Provider</CardTitle>
            <CardDescription>
              There are many LLM API providers. configure as your need.
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
        <Card>
          <CardHeader>
            <CardTitle>Runtime</CardTitle>
            <CardDescription></CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="autoLoadEmbeddingModel"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Auto Load Embedding Model</FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    ></Switch>
                  </FormControl>
                  <FormDescription>
                    The embedding model is automatically loaded when the app
                    starts. It will warm up the embedding model in the worker,
                    which will make the first search faster. This may increase
                    memory usage.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>
        <Button type="submit">Update</Button>
      </form>
    </Form>
  )
}
