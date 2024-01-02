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
  endpointUrl: z.string({
    description: "The URL of AWS/R2 Endpoint.",
    required_error: "AWS/R2 Endpoint URL is required.",
  }),
  accessKeyId: z.string({
    description: "The AWS/R2 Access Key ID.",
    required_error: "AWS/R2 Access Key ID is required.",
  }),
  secretAccessKey: z.string({
    description: "The AWS/R2 Secret Access Key.",
    required_error: "AWS/R2 Secret Access Key is required.",
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
  autoSaveGap: 30,
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
          name="endpointUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Endpoint</FormLabel>
              <FormControl>
                <Input placeholder="https://" autoComplete="off" {...field} />
              </FormControl>
              <FormDescription>The URL of AWS/R2 Endpoint.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="accessKeyId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Access Key ID</FormLabel>
              <FormControl>
                <Input autoComplete="off" type="text" {...field} />
              </FormControl>
              <FormDescription>The AWS/R2 Access Key ID.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="secretAccessKey"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Secret Access Key</FormLabel>
              <FormControl>
                <Input autoComplete="off" type="password" {...field} />
              </FormControl>
              <FormDescription>The AWS/R2 Secret Access Key.</FormDescription>
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
                  {...form.register("autoSaveGap", {
                    valueAsNumber: true,
                  })}
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
