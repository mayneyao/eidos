import { useEffect, useState } from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

import type { ChartConfig } from ".."
import { Chart } from ".."
import { DataGrid } from "./data-grid"
import { DataSourceConfigComponent } from "./data-source-config"
import type { DataSourceConfig, DataTransform } from "./types"

interface ChartPreviewProps {
  config: ChartConfig
  onDataChange: (data: any[]) => void
  dataSource: DataSourceConfig
  onDataSourceChange: (source: DataSourceConfig) => void
  transforms: DataTransform[]
  onTransformsChange: (transforms: DataTransform[]) => void
}

export function ChartPreview({
  config,
  onDataChange,
  dataSource,
  onDataSourceChange,
  transforms,
  onTransformsChange,
}: ChartPreviewProps) {
  const [dataJson, setDataJson] = useState(() =>
    JSON.stringify(config.data, null, 2)
  )

  useEffect(() => {
    setDataJson(JSON.stringify(config.data, null, 2))
  }, [config.data])

  const [dataError, setDataError] = useState<string>("")

  return (
    <div className="h-full flex flex-col overflow-y-auto min-w-[400px] flex-1">
      <Tabs defaultValue="chart" className="w-full h-full flex flex-col">
        <TabsList className="w-full flex justify-start">
          <TabsTrigger value="chart">Chart View</TabsTrigger>
          <TabsTrigger value="table">Table View</TabsTrigger>
          <TabsTrigger value="data-source">Data Source</TabsTrigger>
          <TabsTrigger value="json">JSON Editor</TabsTrigger>
        </TabsList>
        <TabsContent value="chart" className="mt-2 flex-1">
          <Chart {...config} />
        </TabsContent>
        <TabsContent value="table" className="mt-2 flex-1">
          <DataGrid data={config.data} onDataChange={onDataChange} />
        </TabsContent>
        <TabsContent value="json" className="mt-2 flex-1">
          <div className="h-full">
            <Textarea
              value={dataJson}
              onChange={(e) => {
                setDataJson(e.target.value)
                try {
                  const parsed = JSON.parse(e.target.value)
                  if (!Array.isArray(parsed)) {
                    setDataError("Data must be an array")
                    return
                  }
                  setDataError("")
                  onDataChange(parsed)
                } catch (err) {
                  setDataError("Invalid JSON format")
                }
              }}
              className="font-mono text-sm h-full outline-hidden"
              placeholder="Enter JSON data array"
            />
            {dataError && (
              <p className="text-sm text-destructive">{dataError}</p>
            )}
          </div>
        </TabsContent>
        <TabsContent value="data-source" className="mt-2">
          <DataSourceConfigComponent
            data={config.data}
            onDataChange={onDataChange}
            dataSource={dataSource}
            onDataSourceChange={onDataSourceChange}
            transforms={transforms}
            onTransformsChange={onTransformsChange}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
