import { IScript } from "@/worker/meta_table/script"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useLoaderData, useNavigate, useRevalidator } from "react-router-dom"
import * as z from "zod"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/react-hook-form/form"

import { ScriptBinding } from "./detail-bind"
import { useScript } from "./hooks/use-script"

const formSchema = z.object({
  code: z.string(),
})

export const ScriptDetailPage = () => {
  const script = useLoaderData() as IScript
  const { deleteScript, enableScript, disableScript, updateScript } =
    useScript()
  const router = useNavigate()
  const revalidator = useRevalidator()
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: script as any,
  })

  const { toast } = useToast()
  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (values.code !== script.code) {
      await updateScript({
        ...script,
        code: values.code,
      })
      toast({
        title: "Code Updated Successfully",
      })
    }
  }

  const { space } = useCurrentPathInfo()
  const handleDeleteScript = async () => {
    deleteScript(script.id)
    router(`/${space}/scripts`)
  }

  const handleToggleEnabled = async (id: string, checked: boolean) => {
    if (checked) {
      await enableScript(id)
    } else {
      await disableScript(id)
    }
    revalidator.revalidate()
  }

  return (
    <div className="p-6">
      <Tabs defaultValue="account" className="w-[600px]">
        <TabsList>
          <TabsTrigger value="account">Basic</TabsTrigger>
          <TabsTrigger value="password">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="account">
          <div className="flex flex-col gap-4">
            <div className="flex justify-between">
              <h2 className="mb-2 text-xl font-semibold">
                {script.name}({script.version})
              </h2>
              <Switch
                checked={script.enabled}
                onCheckedChange={(checked) =>
                  handleToggleEnabled(script.id, checked)
                }
              ></Switch>
            </div>
            <p>{script.description}</p>
            <Separator />
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-8"
              >
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Code</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={20}
                          placeholder="Enter code"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-between">
                  <Button type="submit">Update</Button>
                  <Button variant="outline" onClick={handleDeleteScript}>
                    Delete
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </TabsContent>
        <TabsContent value="password">
          <ScriptBinding />
        </TabsContent>
      </Tabs>
    </div>
  )
}
