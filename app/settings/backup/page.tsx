"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

const backupServerFormSchema = z.object({
  url: z.string({
    description: "The URL of your backup server.",
  }),
  token: z.string({
    required_error: "Token is required.",
  }),
  autoSaveGap: z.number({
    description:
      "The time gap between auto save. eg: 5 means every 5 minutes will auto save once.",
  }),
})

export type BackupServerFormValues = z.infer<typeof backupServerFormSchema>

// This can come from your database or API.
const defaultValues: Partial<BackupServerFormValues> = {
  // name: "Your name",
  // dob: new Date("2023-01-23"),
  autoSaveGap: 10,
}

export function BackupServerForm() {
  const { backupServer, setBackupServer } = useConfigStore()

  const form = useForm<BackupServerFormValues>({
    resolver: zodResolver(backupServerFormSchema),
    defaultValues: {
      ...defaultValues,
      ...backupServer,
    },
  })

  function onSubmit(data: BackupServerFormValues) {
    setBackupServer(data)
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
              <FormLabel>Server Url</FormLabel>
              <FormControl>
                <Input placeholder="https://" autoComplete="off" {...field} />
              </FormControl>
              <FormDescription>
                This is the backup server endpoint. We use Cloudflare KV to
                store your data. check out the docs for more info.
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
                  placeholder="token"
                  autoComplete="off"
                  type="password"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                This is the token for accessing the backup server. Please keep
                it safe.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="autoSaveGap"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Auto Save Gap(minutes)</FormLabel>
              <FormControl>
                <Input
                  placeholder="10"
                  autoComplete="off"
                  type="number"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Every {field.value} minutes will auto save once.
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

export const BackupSettings = () => {
  return <BackupServerForm />
}
