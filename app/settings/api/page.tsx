"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

import { useConfigStore } from "../store"

const apiAgentFormSchema = z.object({
  url: z.string({
    description: "The URL of your api agent",
  }),
  enabled: z.boolean({
    description: "Whether to enable api agent",
  }),
})

export type APIAgentFormValues = z.infer<typeof apiAgentFormSchema>

// This can come from your database or API.
const defaultValues: Partial<APIAgentFormValues> = {
  url: "ws://localhost:3333",
  enabled: false,
}

export function APIAgentForm() {
  const { apiAgentConfig, setAPIAgentConfig } = useConfigStore()

  const form = useForm<APIAgentFormValues>({
    resolver: zodResolver(apiAgentFormSchema),
    defaultValues: {
      ...defaultValues,
      ...apiAgentConfig,
    },
  })

  function onSubmit(data: APIAgentFormValues) {
    setAPIAgentConfig(data)
    toast({
      title: "You submitted the following values:",
      description: (
        <pre className="mt-2 w-[340px] rounded-md bg-slate-950 p-4">
          <code className="text-white">{JSON.stringify(data, null, 2)}</code>
        </pre>
      ),
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>API Agent URL</FormLabel>
              <FormControl>
                <Input placeholder="wss://" autoComplete="off" {...field} />
              </FormControl>
              <FormDescription>The URL of your API Agent.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="enabled"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Enable</FormLabel>
              <FormControl>
                <div className="flex">
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </div>
              </FormControl>
              <FormDescription>
                When enable, you can query data from Eidos Web APP through API
                Agent.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Update</Button>
      </form>
    </Form>
  )
}

export default function APISettingsPage() {
  return <APIAgentForm />
}
