import { CodeIcon, FileJsonIcon, TableIcon } from "lucide-react"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/components/ui/use-toast"
import { Callout } from "@/components/eui/callout"

import { DataTransforms } from "../../data-pipeline/data-transforms"
import { ScriptDataSource } from "./script-data-source"
import { TableDataSource } from "./table-data-source"
import type { DataSourceConfig, DataSourceType, DataTransform } from "./types"

interface DataSourceConfigProps {
  data: any[]
  onDataChange: (data: any[]) => void
  dataSource: DataSourceConfig
  onDataSourceChange: (source: DataSourceConfig) => void
  transforms: DataTransform[]
  onTransformsChange: (transforms: DataTransform[]) => void
}

export function DataSourceConfigComponent({
  data,
  onDataChange,
  dataSource,
  onDataSourceChange,
  transforms,
  onTransformsChange,
}: DataSourceConfigProps) {
  const handleDynamicSourceChange = (type: DataSourceType) => {
    switch (type) {
      case "raw":
        onDataSourceChange({ type: "raw" })
        break
      case "table":
        onDataSourceChange({ type: "table", tableId: "" })
        break
      case "script":
        onDataSourceChange({ type: "script", scriptId: "" })
        break
    }
  }

  const applyTransforms = (data: any[]) => {
    return transforms.reduce((result, transform) => {
      switch (transform.type) {
        case "filter":
          return result.filter((item) =>
            String(item[transform.config.filterColumn!]).includes(
              transform.config.filterValue!
            )
          )
        case "sort":
          return [...result].sort((a, b) => {
            const aVal = a[transform.config.sortColumn!]
            const bVal = b[transform.config.sortColumn!]
            return transform.config.sortDirection === "asc"
              ? aVal > bVal
                ? 1
                : -1
              : aVal < bVal
                ? 1
                : -1
          })
        case "aggregate":
          if (!transform.config.groupByColumn) return result
          const groups = result.reduce(
            (acc, item) => {
              const key = item[transform.config.groupByColumn!]
              if (!acc[key]) acc[key] = []
              acc[key].push(item)
              return acc
            },
            {} as Record<string, any[]>
          )

          return (Object.entries(groups) as [string, any[]][]).map(
            ([key, group]) => {
              const value =
                transform.config.aggregateFunction === "sum"
                  ? group.reduce(
                      (sum, item) =>
                        sum + Number(item[transform.config.aggregateColumn!]),
                      0
                    )
                  : transform.config.aggregateFunction === "avg"
                    ? group.reduce(
                        (sum: number, item: any) =>
                          sum + Number(item[transform.config.aggregateColumn!]),
                        0
                      ) / group.length
                    : group.length

              return {
                [transform.config.groupByColumn!]: key,
                [`${transform.config.aggregateFunction}_${transform.config.aggregateColumn}`]:
                  value,
              }
            }
          )
        default:
          return result
      }
    }, data)
  }

  const handleDataUpdate = (newData: any[]) => {
    const transformedData = applyTransforms(newData)
    onDataChange(transformedData)
    toast({
      title: "Transform Applied",
      description: "Draft data has been updated.",
    })
  }

  return (
    <div className="space-y-4 h-full overflow-y-auto">
      <div className="p-4 space-y-4 border rounded-md">
        <div className="space-y-2">
          <Label>Source Type</Label>
          <Select
            value={dataSource.type}
            onValueChange={handleDynamicSourceChange}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select data source type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="raw">Raw</SelectItem>
              <SelectItem value="table">Table</SelectItem>
              <SelectItem value="script">Script</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          {dataSource.type === "raw" && (
            <Callout icon={<FileJsonIcon className="h-4 w-4" />}>
              Raw Data will be used as the data source for the chart. You can
              use the <span className="font-medium">JSON editor</span> to edit
              the data.
            </Callout>
          )}

          {dataSource.type === "table" && (
            <div className="h-full">
              <Callout icon={<TableIcon className="h-4 w-4" />}>
                Table will be used as the data source for the chart. You can
                build custom queries to fetch the data you need. When you
                execute the query, the data will be apply to the chart. you can
                also reset data by clicking the{" "}
                <span className="font-medium">Cancel</span> button.
              </Callout>
              <TableDataSource
                config={dataSource}
                onConfigChange={onDataSourceChange}
                onDataChange={onDataChange}
              />
            </div>
          )}

          {dataSource.type === "script" && (
            <>
              <Callout icon={<CodeIcon className="h-4 w-4" />}>
                Script will be used as the data source for the chart. You can
                write custom JavaScript/Python code to fetch and transform your
                data. Script should expose a `data` property that is an array of
                objects or a function named `data` that returns an array of
                objects
                <br />
                The script won't run automatically, you need to click the{" "}
                <span className="font-medium">Fetch Data</span> button to fetch
                the data.
              </Callout>
              <ScriptDataSource
                config={dataSource}
                onConfigChange={onDataSourceChange}
                onDataChange={onDataChange}
              />
            </>
          )}
        </div>
      </div>
      <DataTransforms
        data={data}
        transforms={transforms}
        onTransformsChange={onTransformsChange}
        onApplyTransforms={() => handleDataUpdate(data)}
      />
    </div>
  )
}
