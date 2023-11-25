import { useMemo, useState } from "react"
import { IScript } from "@/worker/meta_table/script"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useLoaderData, useNavigate, useRevalidator } from "react-router-dom"
import * as z from "zod"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useSqliteStore } from "@/hooks/use-sqlite"
import { useTablesUiColumns } from "@/hooks/use-ui-columns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/react-hook-form/form"

import { useScript } from "./hooks/use-script"

const formSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  code: z.string(),
  inputJsonSchema: z.string().optional(),
  outputJsonSchema: z.string().optional(),
  envMap: z.string().optional(),
})

const ScriptBinding = () => {
  const script = useLoaderData() as IScript
  const { allNodes } = useSqliteStore()
  const allTables = allNodes.filter((node) => node.type === "table")
  const { space } = useCurrentPathInfo()

  const [fieldsMap, setFieldsMap] = useState<IScript["fieldsMap"]>(
    script.fieldsMap
  )
  const revalidator = useRevalidator()

  const tables = useMemo(() => {
    return Object.values(fieldsMap || {}).map((fieldMap) => fieldMap.name)
  }, [fieldsMap])
  const { uiColumnsMap } = useTablesUiColumns(tables, space)
  const { updateScript } = useScript()
  const handleTableChange = (tableName: string, value: string) => {
    const newFieldsMap = {
      ...fieldsMap,
      [tableName]: {
        name: value,
        fieldsMap: {
          ...fieldsMap?.[tableName]?.fieldsMap,
        },
      },
    }
    setFieldsMap(newFieldsMap)
  }

  const handleFieldChange = (
    tableName: string,
    fieldName: string,
    value: string
  ) => {
    const newFieldsMap = {
      ...fieldsMap,
      [tableName]: {
        ...fieldsMap?.[tableName]!,
        fieldsMap: {
          ...fieldsMap?.[tableName]?.fieldsMap,
          [fieldName]: value,
        },
      },
    }
    setFieldsMap(newFieldsMap)
  }
  const handleSave = async () => {
    await updateScript({
      ...script,
      fieldsMap,
    })
    revalidator.revalidate()
  }
  return (
    <div>
      <h1>Table Map</h1>
      {script.tables?.map((table) => {
        return (
          <div key={table.name}>
            <div className="flex w-full justify-between">
              <div>{table.name} </div>
              <div>
                <select
                  name=""
                  id=""
                  value={fieldsMap?.[table.name]?.name ?? ""}
                  onChange={(e) =>
                    handleTableChange(table.name, e.target.value)
                  }
                >
                  <option value="">Select a table</option>
                  {allTables.map((table) => {
                    return (
                      <option value={`tb_${table.id}`} key={table.id}>
                        {table.name || "Untitled"}
                      </option>
                    )
                  })}
                </select>
              </div>
            </div>
            {fieldsMap?.[table.name] && (
              <div>
                <h1>Field Map</h1>
                {table.fields.map((field) => {
                  return (
                    <div key={field.name}>
                      <div className="flex w-full justify-between">
                        <div>{field.name} </div>
                        <div>
                          <select
                            name=""
                            id=""
                            value={
                              fieldsMap?.[table.name]?.fieldsMap[field.name] ??
                              ""
                            }
                            onChange={(e) =>
                              handleFieldChange(
                                table.name,
                                field.name,
                                e.target.value
                              )
                            }
                          >
                            <option value="">Select a field</option>
                            {uiColumnsMap[fieldsMap?.[table.name]?.name]?.map(
                              (field) => {
                                return (
                                  <option value={field.name} key={field.name}>
                                    {field.name}
                                  </option>
                                )
                              }
                            )}
                          </select>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
      <Button onClick={handleSave}>Save</Button>
    </div>
  )
}

export const ScriptDetailPage = () => {
  const script = useLoaderData() as IScript
  const { deleteScript } = useScript()
  const router = useNavigate()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: script as any,
  })
  function onSubmit(values: z.infer<typeof formSchema>) {
    // Do something with the form values.
    // ✅ This will be type-safe and validated.
    console.log(values)
  }
  const { space } = useCurrentPathInfo()
  const handleDeleteScript = async () => {
    deleteScript(script.id)
    router(`/${space}/scripts`)
  }
  return (
    <div className="p-6">
      <Tabs defaultValue="account" className="w-[400px]">
        <TabsList>
          <TabsTrigger value="account">Basic</TabsTrigger>
          <TabsTrigger value="password">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="account">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <FormField
                control={form.control}
                name="id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID</FormLabel>
                    <FormControl>
                      <Input {...field} disabled />
                    </FormControl>
                    <FormDescription>
                      Enter the ID. It must be unique.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} disabled />
                    </FormControl>
                    <FormDescription>Enter your name.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter description"
                        {...field}
                        disabled
                      />
                    </FormControl>
                    <FormDescription>Enter the description.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="version"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Version</FormLabel>
                    <FormControl>
                      <Input placeholder="1.0.0" {...field} disabled />
                    </FormControl>
                    <FormDescription>Enter the version.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Textarea rows={20} placeholder="Enter code" {...field} />
                    </FormControl>
                    <FormDescription>Enter the code.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit">Update</Button>
            </form>
          </Form>
        </TabsContent>
        <TabsContent value="password">
          <ScriptBinding />
          <Button variant="destructive" onClick={handleDeleteScript}>
            Delete
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  )
}
