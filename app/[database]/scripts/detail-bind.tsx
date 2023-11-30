import { useMemo, useState } from "react"
import { IScript } from "@/worker/meta_table/script"
import { useLoaderData, useRevalidator } from "react-router-dom"

import { getRawTableNameById } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useSqliteStore } from "@/hooks/use-sqlite"
import { useTablesUiColumns } from "@/hooks/use-ui-columns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/components/ui/use-toast"

import { useScript } from "./hooks/use-script"

export const ScriptBinding = () => {
  const script = useLoaderData() as IScript
  const { allNodes } = useSqliteStore()
  const allTables = allNodes.filter((node) => node.type === "table")
  const { space } = useCurrentPathInfo()

  const [fieldsMap, setFieldsMap] = useState<IScript["fieldsMap"]>(
    script.fieldsMap
  )

  const [envMap, setEnvMap] = useState<IScript["envMap"]>(script.envMap)

  const revalidator = useRevalidator()
  const { toast } = useToast()

  const tables = useMemo(() => {
    return Object.values(fieldsMap || {}).map((fieldMap) => fieldMap.name)
  }, [fieldsMap])
  const { uiColumnsMap } = useTablesUiColumns(tables, space)
  const { updateScript } = useScript()
  const handleSave = async () => {
    await updateScript({
      ...script,
      fieldsMap,
      envMap,
    })
    revalidator.revalidate()
    toast({
      title: "Script Updated Successfully",
    })
  }
  const handleTableChange = (tableName: string, tableId: string) => {
    const newFieldsMap = {
      ...fieldsMap,
      [tableName]: {
        id: tableId,
        name: getRawTableNameById(tableId),
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

  return (
    <div>
      {Boolean(script.tables?.length) && (
        <div className="flex flex-col gap-2">
          <h2 className="mb-2 text-xl font-semibold">Table Map</h2>
          <p>This script need to bind tables</p>
          {script.tables?.map((table) => {
            return (
              <div key={table.name} className="flex flex-col gap-2">
                <Separator />
                <div className="flex w-full items-center justify-between">
                  <div className="font-semibold">{table.name} </div>
                  <Select
                    value={fieldsMap?.[table.name]?.id ?? ""}
                    onValueChange={(value) =>
                      handleTableChange(table.name, value)
                    }
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Bind Table" />
                    </SelectTrigger>
                    <SelectContent>
                      {allTables.map((table) => {
                        return (
                          <SelectItem value={table.id} key={table.id}>
                            {table.name || "Untitled"}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
                {fieldsMap?.[table.name] && (
                  <div className="ml-8">
                    <h2 className="mb-2 text-lg font-medium">Field Map</h2>
                    {table.fields.map((field) => {
                      return (
                        <div key={field.name}>
                          <div className="mt-1 flex w-full justify-between">
                            <div>{field.name} </div>
                            <div>
                              <Select
                                value={
                                  fieldsMap?.[table.name]?.fieldsMap[
                                    field.name
                                  ] ?? ""
                                }
                                onValueChange={(value) =>
                                  handleFieldChange(
                                    table.name,
                                    field.name,
                                    value
                                  )
                                }
                              >
                                <SelectTrigger className="w-[180px]">
                                  <SelectValue placeholder="Bind Field" />
                                </SelectTrigger>
                                <SelectContent>
                                  {uiColumnsMap[
                                    fieldsMap?.[table.name]?.name
                                  ]?.map((field) => {
                                    return (
                                      <SelectItem
                                        value={field.table_column_name}
                                        key={field.table_column_name}
                                      >
                                        {field.name}
                                      </SelectItem>
                                    )
                                  })}
                                </SelectContent>
                              </Select>
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
        </div>
      )}
      {Boolean(script.envs?.length) && (
        <>
          <Separator className="mt-2" />
          <h2 className="mb-2 mt-4 text-xl font-semibold">
            Environment Variables
          </h2>
          <p>This script need to configure environment variables</p>
          <div>
            {script.envs?.map((env) => {
              return (
                <div
                  className="mt-1 flex items-center justify-between"
                  key={env.name}
                >
                  <span>{env.name}</span>
                  <Input
                    className="w-[200px]"
                    value={envMap?.[env.name] ?? ""}
                    onChange={(e) => {
                      setEnvMap({
                        ...envMap,
                        [env.name]: e.target.value,
                      })
                    }}
                  />
                </div>
              )
            })}
          </div>
        </>
      )}
      <Separator className="mt-2" />
      <div className="mt-4">
        <Button onClick={handleSave}>Update</Button>
      </div>
    </div>
  )
}
