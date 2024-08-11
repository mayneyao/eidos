import { useEffect, useMemo } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { CopyIcon } from "lucide-react"
import { useForm } from "react-hook-form"

import { DOMAINS } from "@/lib/const"
import { shortenId, uuidv7 } from "@/lib/utils"
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

import {
  APIAgentFormValues,
  apiAgentFormSchema,
  useAPIConfigStore,
} from "./store"

// This can come from your database or API.
const defaultValues: Partial<APIAgentFormValues> = {
  url: "ws://localhost:3333",
  enabled: false,
}

export function APIAgentForm() {
  const { apiAgentConfig, setAPIAgentConfig } = useAPIConfigStore()

  const form = useForm<APIAgentFormValues>({
    resolver: zodResolver(apiAgentFormSchema),
    defaultValues,
  })
  const { reset } = form

  useEffect(() => {
    reset(apiAgentConfig)
  }, [apiAgentConfig, reset])

  function onSubmit(data: APIAgentFormValues) {
    setAPIAgentConfig(data)
    toast({
      title: "API Agent settings updated.",
    })
  }
  const regen = (e: React.MouseEvent) => {
    e.preventDefault()
    const url = new URL(DOMAINS.API_AGENT_SERVER)
    url.pathname = `/websocket/${uuidv7()}`
    url.protocol = "wss:"
    form.setValue("url", url.toString())
    form.trigger("url")
  }
  const url = form.getValues("url")
  const apiURL = useMemo(() => {
    try {
      const apiURL = new URL(url)
      if (apiURL.hostname === new URL(DOMAINS.API_AGENT_SERVER).hostname) {
        apiURL.pathname = apiURL.pathname.replace("websocket", "rpc")
        apiURL.protocol = "https:"
        return apiURL.toString()
      }
      return ""
    } catch (error) {
      return ""
    }
  }, [url])

  const handleCopyUrl = (e: React.MouseEvent) => {
    e.preventDefault()
    navigator.clipboard.writeText(apiURL)
    toast({
      title: "Copied to clipboard",
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
                <div className="flex gap-2">
                  <Input placeholder="wss://" autoComplete="off" {...field} />
                  <Button variant="secondary" onClick={regen}>
                    Regenerate
                  </Button>
                </div>
              </FormControl>
              <FormDescription>The URL of your API Agent.</FormDescription>
              {Boolean(apiURL.length) && (
                <FormDescription>
                  Call API through{" "}
                  <div className="flex items-center gap-2">
                    <span className=" text-cyan-500">{apiURL}</span>
                    <Button variant="ghost" size="xs" onClick={handleCopyUrl}>
                      <CopyIcon className="h-4 w-4"></CopyIcon>
                    </Button>
                  </div>
                </FormDescription>
              )}
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
                When enabled, you can query data from Eidos Web APP through{" "}
                <a
                  href="https://github.com/mayneyao/eidos-api-agent-node"
                  className="text-blue-500"
                  target="_blank"
                >
                  API Agent
                </a>
                .
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
