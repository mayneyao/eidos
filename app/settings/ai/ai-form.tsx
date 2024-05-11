import { useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

import { useConfigStore } from "../store"
import { AutoRunScopesWithDesc } from "./const"
import { LocalLLMManage } from "./local-llm-manage"

const AIConfigFormSchema = z.object({
  // openai
  token: z.string().optional(),
  baseUrl: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_MODELS: z
    .string()
    .optional()
    .default("gpt-3.5-turbo-1106, gpt-4-1106-preview, gpt-4-vision-preview"),
  // google gemini can't modify the base url
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_MODELS: z.string().optional().default("gemini-pro"),

  // groq
  GROQ_BASE_URL: z
    .string()
    .optional()
    .default("https://api.groq.com/openai/v1"),
  GROQ_API_KEY: z.string().optional(),

  GROQ_MODELS: z
    .string()
    .optional()
    .default("llama2-70b-4096, mixtral-8x7b-32768"),

  autoRunScope: z.array(z.string()),
  localModels: z.array(z.string()),
})

export type AIConfigFormValues = z.infer<typeof AIConfigFormSchema>

export const AutoRunScopes = AutoRunScopesWithDesc.map((item) => item.value)

// This can come from your database or API.
const defaultValues: Partial<AIConfigFormValues> = {
  // name: "Your name",
  // dob: new Date("2023-01-23"),
  autoRunScope: [],
  localModels: [],
}

export function AIConfigForm() {
  const { setAiConfig, aiConfig } = useConfigStore()
  const form = useForm<AIConfigFormValues>({
    resolver: zodResolver(AIConfigFormSchema),
    defaultValues: {
      ...defaultValues,
      ...aiConfig,
    },
  })
  const { reset } = form

  useEffect(() => {
    reset(aiConfig)
  }, [aiConfig, reset])

  function onSubmit(data: AIConfigFormValues) {
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
            <Tabs defaultValue="openai">
              <TabsList>
                <TabsTrigger value="openai">OpenAI</TabsTrigger>
                <TabsTrigger value="google">Google</TabsTrigger>
                <TabsTrigger value="groq">Groq</TabsTrigger>
              </TabsList>
              <TabsContent value="openai">
                <FormField
                  control={form.control}
                  name="baseUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Base URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://api.openai.com/v1"
                          {...field}
                          type="text"
                        />
                      </FormControl>
                      <FormDescription>
                        This is the base URL used to access the OpenAI API or
                        API compatible service.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="token"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Token</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="OpenAI API Token"
                          {...field}
                          type="password"
                        />
                      </FormControl>
                      <FormDescription>
                        This is the token used to access the OpenAI API.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="OPENAI_MODELS"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Models</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="gpt-3.5-turbo-1106, gpt-4-1106-preview"
                          {...field}
                          type="text"
                        />
                      </FormControl>
                      <FormDescription>
                        add models to use, comma separated.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>
              <TabsContent value="google">
                <FormField
                  control={form.control}
                  name="GOOGLE_API_KEY"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>API Key</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Google API Key"
                          {...field}
                          type="password"
                        />
                      </FormControl>
                      <FormDescription>
                        This is the token used to access the Google API.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="GOOGLE_MODELS"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Models</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="gemini-pro"
                          {...field}
                          type="text"
                        />
                      </FormControl>
                      <FormDescription>
                        add models to use, comma separated.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>
              <TabsContent value="groq">
                <FormField
                  control={form.control}
                  name="GROQ_BASE_URL"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Base URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://api.groq.com/openai/v1"
                          {...field}
                          type="text"
                        />
                      </FormControl>
                      <FormDescription>
                        This is the base URL used to access the Groq API or API
                        compatible service.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="GROQ_API_KEY"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>API Key</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Groq API Key"
                          {...field}
                          type="password"
                        />
                      </FormControl>
                      <FormDescription>
                        This is the token used to access the Groq API.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="GROQ_MODELS"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Models</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="llama2-70b-4096, mixtral-8x7b-32768"
                          {...field}
                          type="text"
                        />
                      </FormControl>
                      <FormDescription>
                        add models to use, comma separated.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Permission</CardTitle>
            <CardDescription>
              If enabled, the code generated by the AI will be automatically
              run.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="autoRunScope"
              render={() => (
                <FormItem>
                  {/* <div className="mb-4">
                    <FormLabel className="text-base">Permission</FormLabel>
                    <FormDescription>
                      If enabled, the code generated by the AI will be
                      automatically run.
                    </FormDescription>
                  </div> */}
                  {AutoRunScopesWithDesc.map(({ value: key, description }) => (
                    <FormField
                      key={key}
                      control={form.control}
                      name="autoRunScope"
                      render={({ field }) => {
                        return (
                          <FormItem
                            key={key}
                            className="flex flex-row items-start space-x-3 space-y-0"
                          >
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(key)}
                                onCheckedChange={(checked: any) => {
                                  return checked
                                    ? field.onChange([...field.value, key])
                                    : field.onChange(
                                        field.value?.filter(
                                          (value) => value !== key
                                        )
                                      )
                                }}
                              />
                            </FormControl>
                            <FormLabel className="font-normal">
                              {description}
                            </FormLabel>
                          </FormItem>
                        )
                      }}
                    />
                  ))}
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
