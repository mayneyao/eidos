import { useCallback, useEffect, useRef, useState } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $getNodeByKey, type NodeKey } from "lexical"
import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/components/ui/use-toast"
import { Chart, type ChartConfig } from "@/components/chart"
import { ChartConfigForm } from "@/components/chart/config-form/chart-config-form"
import type {
  DataSourceConfig,
  DataTransform,
} from "@/components/chart/config-form/types"

import { $isChartNode } from "./node"

export interface ChartBlockProps {
  config: string
  nodeKey: NodeKey
  id: string
  dataSource: DataSourceConfig
  transforms: DataTransform[]
}

export const ChartBlock: React.FC<ChartBlockProps> = ({
  config,
  nodeKey,
  id,
  dataSource,
  transforms,
}) => {
  const [parsedConfig, setParsedConfig] = useState<ChartConfig | null>(null)
  const [parseError, setParseError] = useState<string>("")
  const [editor] = useLexicalComposerContext()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const parsed = JSON.parse(config) as ChartConfig
      setParsedConfig(parsed)
      setParseError("")
    } catch (error) {
      setParsedConfig(null)
      setParseError("Invalid JSON configuration")
    }
  }, [config])

  const handleConfigChange = useCallback(
    (newConfig: ChartConfig) => {
      setParsedConfig(newConfig)
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isChartNode(node)) {
          node.setConfig(JSON.stringify(newConfig, null, 2))
        }
      })
    },
    [editor, nodeKey]
  )

  const handleDataSourceChange = useCallback(
    (newDataSource: DataSourceConfig) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isChartNode(node)) {
          console.log("newDataSource", newDataSource)
          node.setDataSource(newDataSource)
        }
      })
    },
    [editor, nodeKey]
  )

  const handleTransformsChange = useCallback(
    (newTransforms: DataTransform[]) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isChartNode(node)) {
          console.log("newTransforms", newTransforms)
          node.setTransforms(newTransforms)
        }
      })
    },
    [editor, nodeKey]
  )

  const copyContent = useCallback(
    async (format: "png" | "svg" | "text") => {
      const chartRef = document.querySelector("#chart-renderer")
      if (chartRef) {
        try {
          if (format === "text") {
            await navigator.clipboard.writeText(config)
          } else if (format === "svg") {
            const svgText = chartRef.innerHTML
            await navigator.clipboard.writeText(svgText)
          } else {
            const canvas = await import("html2canvas").then((module) =>
              module.default(chartRef as HTMLElement)
            )
            canvas.toBlob((blob) => {
              if (blob) {
                const item = new ClipboardItem({ [`image/${format}`]: blob })
                navigator.clipboard.write([item])
              }
            }, `image/${format}`)
          }
          toast({
            title: `Copied as ${format}`,
            description: "Successfully copied the chart to the clipboard",
          })
        } catch (error) {
          console.error(`Failed to copy as ${format}:`, error)
          toast({
            title: `Failed to copy as ${format}`,
            description: "Failed to copy the chart to the clipboard",
          })
        }
      }
    },
    [config, toast]
  )

  return (
    <div
      className="relative group bg-secondary"
      style={{ minHeight: "200px" }}
      ref={containerRef}
      data-block-id={id}
    >
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-10">
        {parsedConfig && (
          <ChartConfigForm
            config={parsedConfig}
            onConfigChange={handleConfigChange}
            open={open}
            onOpenChange={setOpen}
            dataSource={dataSource}
            transforms={transforms}
            onDataSourceChange={handleDataSourceChange}
            onTransformsChange={handleTransformsChange}
          />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="xs">
              Copy as <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent container={containerRef.current!}>
            <DropdownMenuItem onClick={() => copyContent("text")}>
              Text
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => copyContent("png")}>
              PNG
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div
        id="chart-renderer"
        className="group-hover:pointer-events-auto pointer-events-none p-2"
      >
        {parseError && <div className="text-red-500">{parseError}</div>}
        {parsedConfig && (
          <div>
            <Chart {...parsedConfig} />
          </div>
        )}
      </div>
    </div>
  )
}
