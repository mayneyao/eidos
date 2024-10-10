import { useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"

import { useEidosFileSystemManager } from "@/hooks/use-fs"
import { registerPeriodicSync } from "@/hooks/use-register-period-sync"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
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

const backupServerFormSchema = z.object({
  Github__repo: z
    .string({
      description: "The Github Repo.",
      required_error: "Github Repo is required.",
    })
    .optional(),
  Github__token: z
    .string({
      description: "The Github Token.",
      required_error: "Github Token is required.",
    })
    .optional(),
  Github__enabled: z
    .boolean({
      description: "Enable Github Backup.",
    })
    .optional(),
  S3__endpointUrl: z
    .string({
      description: "The URL of AWS/R2 Endpoint.",
      required_error: "AWS/R2 Endpoint URL is required.",
    })
    .optional(),
  S3__accessKeyId: z
    .string({
      description: "The AWS/R2 Access Key ID.",
      required_error: "AWS/R2 Access Key ID is required.",
    })
    .optional(),
  S3__secretAccessKey: z
    .string({
      description: "The AWS/R2 Secret Access Key.",
      required_error: "AWS/R2 Secret Access Key is required.",
    })
    .optional(),
  S3__enabled: z
    .boolean({
      description: "Enable S3 Backup.",
    })
    .optional(),
  spaceList: z.string().optional(),
  autoSaveGap: z.number({
    description:
      "The time gap between auto save. eg: 5 means every 5 minutes will auto save once.",
  }),
})

export type BackupServerFormValues = z.infer<typeof backupServerFormSchema>

// This can come from your database or API.
const defaultValues: Partial<BackupServerFormValues> = {
  autoSaveGap: 360,
}

export function BackupServerForm() {
  const { backupServer, setBackupServer } = useConfigStore()

  const { efsManager } = useEidosFileSystemManager()
  const form = useForm<BackupServerFormValues>({
    resolver: zodResolver(backupServerFormSchema),
    defaultValues: {
      ...defaultValues,
      ...backupServer,
    },
  })

  const { reset } = form

  useEffect(() => {
    reset(backupServer)
  }, [backupServer, reset])

  async function onSubmit(data: BackupServerFormValues) {
    setBackupServer(data)
    // we need use this config to run backup periodic sync task, but we can't access localStorage in service worker
    // so we need to save it to a file in OPFS
    await efsManager.updateOrCreateDocFile(
      ["__eidos__config.json"],
      JSON.stringify(data)
    )
    const res = await registerPeriodicSync()
    toast({
      title: "Update Backup Server Config",
      description: `The backup task has been ${res}.`,
    })
  }

  return (
    <div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <FormField
            control={form.control}
            name="spaceList"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Space List</FormLabel>
                <FormControl>
                  <Input
                    placeholder="space1,space2"
                    autoComplete="off"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  space in this list will be backup automatically, eg:
                  space1,space2
                  <div className="my-2">
                    you can also backup space manually even it's not in the
                    list.
                  </div>
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
                <FormLabel>Auto backup gap(minutes)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="10"
                    autoComplete="off"
                    type="number"
                    min={0}
                    {...field}
                    {...form.register("autoSaveGap", {
                      valueAsNumber: true,
                    })}
                  />
                </FormControl>
                <FormDescription>
                  {field.value == 0
                    ? "Disable auto save."
                    : `backup space every ${field.value} minutes, 0 means disable auto
                  save.`}
                  <div className="my-2">
                    Tips: If you install Eidos as PWA, the backup task will also
                    be triggered even if you close the browser.
                  </div>
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <div>
            <Separator className="my-6" />
            <div className="flex justify-between">
              <h2 className="text-xl font-bold">Github Backup Server</h2>
              <FormField
                control={form.control}
                name="Github__enabled"
                render={({ field }) => (
                  <FormItem>
                    {/* <FormLabel>Enable</FormLabel> */}
                    <FormControl>
                      <div>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </div>
                    </FormControl>
                    {/* <FormDescription>Enable Github Backup.</FormDescription> */}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-8">
              <FormField
                control={form.control}
                name="Github__repo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Repo</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="username/repo"
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      The Github Repo. go to{" "}
                      <a
                        href={`https://github.com/${field.value}`}
                        className=" underline"
                        target="_blank"
                      >
                        {field.value}
                      </a>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="Github__token"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Token</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" type="password" {...field} />
                    </FormControl>
                    <FormDescription>
                      The Github Token. go to{" "}
                      <a
                        href="https://github.com/settings/tokens?type=beta"
                        className=" underline"
                        target="_blank"
                      >
                        https://github.com/settings/tokens
                      </a>{" "}
                      to create one. make sure this token has read&write access
                      to the repo.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
          <div className=" pointer-events-none cursor-not-allowed opacity-50">
            <Separator className="my-6" />
            <div className="flex justify-between">
              <h2 className=" text-xl font-bold">
                S3 Backup Server (Coming Soon...)
              </h2>
              <FormField
                control={form.control}
                name="S3__enabled"
                render={({ field }) => (
                  <FormItem>
                    {/* <FormLabel>Enable</FormLabel> */}
                    <FormControl>
                      <div>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </div>
                    </FormControl>
                    {/* <FormDescription>Enable Github Backup.</FormDescription> */}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="space-y-8">
              <FormField
                control={form.control}
                name="S3__endpointUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Endpoint</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://"
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      The URL of AWS/R2 Endpoint.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="S3__accessKeyId"
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
                name="S3__secretAccessKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Secret Access Key</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" type="password" {...field} />
                    </FormControl>
                    <FormDescription>
                      The AWS/R2 Secret Access Key.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
          <Button type="submit" className="mt-4">
            Update
          </Button>
        </form>
      </Form>
    </div>
  )
}

export const BackupSettings = () => {
  return <BackupServerForm />
}
