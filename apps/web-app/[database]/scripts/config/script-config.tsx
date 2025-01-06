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

  console.log(script)
  const [dependencies, setDependencies] = useState<string[]>(
    script.dependencies || []
  )
  const [newDependency, setNewDependency] = useState("")

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
      dependencies: script.type === "py_script" ? dependencies : undefined,
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

  const handleAddDependency = () => {
    if (newDependency.trim()) {
      setDependencies([...dependencies, newDependency.trim()])
      setNewDependency("")
    }
  }

  const handleRemoveDependency = (index: number) => {
    setDependencies(dependencies.filter((_, i) => i !== index))
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

      {script.type === "py_script" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("extension.config.dependencies")}</CardTitle>
            <CardDescription>
              {t("extension.config.dependenciesDescription")}
              <div className="mt-2 text-sm">
                <p>
                  {t("extension.config.dependenciesBuiltInNote")}{" "}
                  <a
                    href="https://pyodide.org/en/stable/usage/packages-in-pyodide.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {t("extension.config.dependenciesBuiltInLink")}
                  </a>
                </p>
                <p className="mt-1">
                  {t("extension.config.dependenciesPyPINote")}
                </p>
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="flex gap-2">
                <Input
                  placeholder={t("extension.config.dependencyPlaceholder")}
                  value={newDependency}
                  onChange={(e) => setNewDependency(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleAddDependency()
                    }
                  }}
                />
                <Button onClick={handleAddDependency}>
                  {t("extension.config.addDependency")}
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {dependencies.map((dep, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between gap-2 rounded-md border p-2"
                  >
                    <span>{dep}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveDependency(index)}
                    >
                      {t("extension.config.removeDependency")}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Bindings bindings={bindings} onUpdateBindings={handleUpdateBindings} />
      <div className="mt-4">
        <Button onClick={handleSave}>{t("common.update")}</Button>
      </div>
    </div>
  )
}
