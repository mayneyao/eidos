"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/react-hook-form/form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/use-toast"
import { useConfigStore } from "../store"



const AIConfigFormSchema = z.object({
  token: z
    .string()
    .min(2, {
      message: "Name must be at least 2 characters.",
    })
})

export type AIConfigFormValues = z.infer<typeof AIConfigFormSchema>

// This can come from your database or API.
const defaultValues: Partial<AIConfigFormValues> = {
  // name: "Your name",
  // dob: new Date("2023-01-23"),
}

export function AIConfigForm() {
  const { setAiConfig, aiConfig } = useConfigStore();
  const form = useForm<AIConfigFormValues>({
    resolver: zodResolver(AIConfigFormSchema),
    defaultValues: aiConfig
  })

  function onSubmit(data: AIConfigFormValues) {
    setAiConfig(data);
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
          name="token"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Token</FormLabel>
              <FormControl>
                <Input placeholder="OpenAI API Token" {...field} />
              </FormControl>
              <FormDescription>
                This is the token used to access the OpenAI API.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Update Config</Button>
      </form>
    </Form>
  )
}
