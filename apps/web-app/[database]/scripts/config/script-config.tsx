import { IScript } from "@/worker/web-worker/meta-table/script"
import { useMemo, useState } from "react"
import { useLoaderData, useRevalidator } from "react-router-dom"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useAllNodes } from "@/hooks/use-nodes"
import { getRawTableNameById } from "@/lib/utils"

import { useTablesUiColumns } from "../hooks/use-all-table-fields"
import { useScript } from "../hooks/use-script"
import { Bindings } from "./Bindings"
import { useTranslation } from "react-i18next"

export const ScriptConfig = () => {
  const { t } = useTranslation()
  const script = useLoaderData() as IScript
  const allNodes = useAllNodes()
  const allTables = allNodes.filter((node) => node.type === "table")
  const { space } = useCurrentPathInfo()

  const [fieldsMap, setFieldsMap] = useState<IScript["fields_map"]>(
    script.fields_map
  )

  const [envMap, setEnvMap] = useState<IScript["env_map"]>(script.env_map)

  const revalidator = useRevalidator()
  const { toast } = useToast()

  const [bindings, setBindings] = useState<
    Record<string, { type: "table"; value: string }>
  >(script.bindings || {})

  const tables = useMemo(() => {
    return Object.values(fieldsMap || {}).map((fieldMap) => fieldMap.name)
  }, [fieldsMap])
  const { uiColumnsMap } = useTablesUiColumns(tables, space)
  const { updateScript } = useScript()

  const handleUpdateBindings = async (
    newBindings: Record<string, { type: "table"; value: string }>
  ) => {
    setBindings(newBindings)
    await updateScript({
      ...script,
      bindings: newBindings,
    })
    revalidator.revalidate()
    toast({
      title: "Bindings Updated Successfully",
    })
  }

  const handleSave = async () => {
    await updateScript({
      ...script,
      fields_map: fieldsMap,
      env_map: envMap,
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
    <div className="flex flex-col gap-4">
      {Boolean(script.tables?.length) && (
        <Card>
          <CardHeader>
            <CardTitle>{t("extension.config.tableMap")}</CardTitle>
            <CardDescription>{t("extension.config.tableMapDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
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
                        <SelectValue placeholder={t("extension.config.bindTable")} />
                      </SelectTrigger>
                      <SelectContent>
                        {allTables.map((table) => {
                          return (
                            <SelectItem value={table.id} key={table.id}>
                              {table.name || t("common.untitled")}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  {fieldsMap?.[table.name] && (
                    <div className="ml-8">
                      <h2 className="mb-2 text-lg font-medium">
                        {t("extension.config.fieldMap")}
                      </h2>
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
          </CardContent>
        </Card>
      )}

      {Boolean(script.envs?.length) && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("extension.config.environmentVariables")}</CardTitle>
              <CardDescription>
                {t("extension.config.scriptNeedsEnvVars")}
              </CardDescription>
            </CardHeader>
            <CardContent>
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
                        disabled={env.readonly}
                      />
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
      <Bindings bindings={bindings} onUpdateBindings={handleUpdateBindings} />
      <div className="mt-4">
        <Button onClick={handleSave}>{t("common.update")}</Button>
      </div>
    </div>
  )
}
