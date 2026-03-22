import type { LexicalEditor } from "lexical"
import type { DocBlock } from "../interface"
import { $createChartNode, CHART_NODE_TRANSFORMER, ChartNode } from "./node"
import { INSERT_CHART_COMMAND, ChartPlugin } from "./plugin"

const defaultConfig = JSON.stringify(
  {
    type: "bar",
    data: [
      { month: "January", desktop: 186, mobile: 80 },
      { month: "February", desktop: 305, mobile: 200 },
      { month: "March", desktop: 237, mobile: 120 },
      { month: "April", desktop: 73, mobile: 190 },
      { month: "May", desktop: 209, mobile: 130 },
      { month: "June", desktop: 214, mobile: 140 },
    ],
    series: [
      {
        type: "bar",
        dataKey: "desktop",
        name: "Desktop Users",
        style: { fill: "var(--chart-1)" },
      },
      {
        type: "bar",
        dataKey: "mobile",
        name: "Mobile Users",
        style: { fill: "var(--chart-2)" },
      },
    ],
    xAxis: { dataKey: "month" },
    yAxis: {},
    showGrid: true,
    showTooltip: true,
    showLegend: true,
    width: "100%",
    height: 300,
  },
  null,
  2
)

export default {
  name: "Chart",
  node: ChartNode,
  plugin: ChartPlugin,
  icon: "BarChart",
  keywords: ["Chart", "graph", "visualization"],
  onSelect: (editor: LexicalEditor) =>
    editor.dispatchCommand(INSERT_CHART_COMMAND, defaultConfig),
  command: {
    create: INSERT_CHART_COMMAND,
  },
  createNode: $createChartNode,
  transform: CHART_NODE_TRANSFORMER,
  markdownLanguage: "chart",
} as DocBlock
