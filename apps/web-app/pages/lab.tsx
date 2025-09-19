import { useCallback, useEffect, useState } from "react"

import { fileChecksum } from "@/lib/web/crypto"
import { Chart, type ChartConfig } from "@/components/chart"

// Define Worker message types
type PyodideMessage = {
  type: "execute" | "install"
  payload: {
    code?: string
    packages?: string[]
  }
}

type PyodideResponse = {
  type: "success" | "error"
  result?: string
  error?: string
  time?: number
}

export const LabPage = () => {
  const [worker, setWorker] = useState<Worker | null>(null)
  const [output, setOutput] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)

  // Initialize Worker
  useEffect(() => {
    const pyWorker = new Worker(
      new URL("@/worker/web-worker/pyodide/pyodide.ts", import.meta.url),
      { type: "module" }
    )

    pyWorker.onmessage = (event: MessageEvent<PyodideResponse>) => {
      setIsLoading(false)
      if (event.data.type === "success") {
        setOutput(
          (prev) =>
            `${prev}\n> Output (${event.data.time}ms):\n${event.data.result}`
        )
      } else {
        setOutput((prev) => `${prev}\n> Error:\n${event.data.error}`)
      }
    }

    setWorker(pyWorker)
    return () => pyWorker.terminate()
  }, [])

  // Execute Python code
  const runPythonCode = useCallback(
    (code: string) => {
      if (!worker) return

      setIsLoading(true)
      setOutput((prev) => `${prev}\n\n> Executing:\n${code}`)

      worker.postMessage({
        type: "execute",
        payload: { code },
      } as PyodideMessage)
    },
    [worker]
  )

  // Install Python packages
  const installPackages = useCallback(
    (packages: string[]) => {
      if (!worker) return

      setIsLoading(true)
      setOutput(
        (prev) => `${prev}\n\n> Installing packages: ${packages.join(", ")}`
      )

      worker.postMessage({
        type: "install",
        payload: { packages },
      } as PyodideMessage)
    },
    [worker]
  )

  // fileChecksum
  const handleFileUpload = async (file?: File) => {
    if (!file) return

    // time it takes to calculate the hash
    console.time("fileChecksum")
    const hash = await fileChecksum(file)
    console.timeEnd("fileChecksum")
    console.log("File hash:", hash)
  }

  // New: Chart example configuration
  const lineChartConfig: ChartConfig = {
    type: "line",
    data: [
      { name: "A", uv: 400, pv: 240 },
      { name: "B", uv: 300, pv: 200 },
      { name: "C", uv: 200, pv: 300 },
      { name: "D", uv: 278, pv: 180 },
    ],
    series: [
      { type: "line", dataKey: "uv", name: "UV", style: { stroke: "#8884d8" } },
      { type: "line", dataKey: "pv", name: "PV", style: { stroke: "#82ca9d" } },
    ],
    xAxis: { dataKey: "name" },
    yAxis: {},
    showGrid: true,
    showTooltip: true,
    showLegend: true,
    width: "100%",
    height: 300,
  }

  const pieChartConfig: ChartConfig = {
    type: "pie",
    data: [
      { name: "Group A", value: 400 },
      { name: "Group B", value: 300 },
      { name: "Group C", value: 300 },
      { name: "Group D", value: 200 },
    ],
    series: [
      {
        type: "line",
        dataKey: "value",
      },
    ],
    xAxis: { dataKey: "name" },
    showTooltip: true,
    showLegend: true,
    width: 300,
    height: 300,
    themeConfig: {
      "Group A": { label: "Group A", color: "#8884d8" },
      "Group B": { label: "Group B", color: "#82ca9d" },
      "Group C": { label: "Group C", color: "#ffc658" },
      "Group D": { label: "Group D", color: "#ff7300" },
    },
  }

  const barChartConfig: ChartConfig = {
    type: "bar",
    data: [
      { name: "Jan", uv: 400, pv: 240 },
      { name: "Feb", uv: 300, pv: 139 },
      { name: "Mar", uv: 200, pv: 980 },
      { name: "Apr", uv: 278, pv: 390 },
    ],
    series: [
      { type: "bar", dataKey: "uv", name: "UV", style: { fill: "#ff7300" } },
    ],
    xAxis: { dataKey: "name" },
    yAxis: {},
    showGrid: true,
    showTooltip: true,
    showLegend: true,
    width: "100%",
    height: 300,
  }

  const barLineChartConfig: ChartConfig = {
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
        style: { fill: "#8884d8" },
      },
      {
        type: "bar",
        dataKey: "mobile",
        name: "Mobile Users",
        style: { fill: "#82ca9d" },
      },
    ],
    xAxis: { dataKey: "month" },
    yAxis: {},
    showGrid: true,
    showTooltip: true,
    showLegend: true,
    width: "100%",
    height: 300,
  }

  // Add radar chart configuration
  const radarChartConfig: ChartConfig = {
    type: "radar",
    data: [
      { subject: "Math", A: 120, B: 110, fullMark: 150 },
      { subject: "Chinese", A: 98, B: 130, fullMark: 150 },
      { subject: "English", A: 86, B: 130, fullMark: 150 },
      { subject: "Geography", A: 99, B: 100, fullMark: 150 },
      { subject: "Physics", A: 85, B: 90, fullMark: 150 },
      { subject: "History", A: 65, B: 85, fullMark: 150 },
    ],
    series: [
      {
        type: "radar",
        dataKey: "A",
        name: "Student A",
        style: { fill: "#8884d833", stroke: "#8884d8" },
      },
      {
        type: "radar",
        dataKey: "B",
        name: "Student B",
        style: { fill: "#82ca9d33", stroke: "#82ca9d" },
      },
    ],
    xAxis: { dataKey: "subject" },
    showTooltip: true,
    showLegend: true,
    width: 300,
    height: 300,
  }

  const areaChartConfig: ChartConfig = {
    type: "area",
    data: [
      { date: "2023-01", value: 4000, value2: 2400 },
      { date: "2023-02", value: 3000, value2: 1398 },
      { date: "2023-03", value: 2000, value2: 9800 },
      { date: "2023-04", value: 2780, value2: 3908 },
      { date: "2023-05", value: 1890, value2: 4800 },
      { date: "2023-06", value: 2390, value2: 3800 },
    ],
    series: [
      {
        type: "area",
        dataKey: "value",
        name: "Series A",
        style: { fill: "#8884d833", stroke: "#8884d8" },
        stack: true,
      },
      {
        type: "area",
        dataKey: "value2",
        name: "Series B",
        style: { fill: "#82ca9d33", stroke: "#82ca9d" },
        stack: true,
      },
    ],
    xAxis: { dataKey: "date" },
    yAxis: {},
    showGrid: true,
    showTooltip: true,
    showLegend: true,
    width: "100%",
    height: 300,
  }

  // Add scatter chart configuration
  const scatterChartConfig: ChartConfig = {
    type: "scatter",
    data: [
      { height: 170, weight: 67, name: "A" },
      { height: 178, weight: 80, name: "B" },
      { height: 160, weight: 52, name: "C" },
      { height: 165, weight: 58, name: "D" },
      { height: 182, weight: 78, name: "E" },
      { height: 175, weight: 70, name: "F" },
    ],
    series: [
      {
        type: "scatter",
        dataKey: "weight",
        name: "Height-Weight Distribution",
        style: { fill: "#8884d8" },
      },
    ],
    xAxis: {
      dataKey: "height",
      label: "Height (cm)",
      type: "number",
    },
    yAxis: {
      label: "Weight (kg)",
      type: "number",
    },
    showGrid: true,
    showTooltip: true,
    showLegend: true,
    width: "100%",
    height: 300,
  }

  const composedChartConfig: ChartConfig = {
    type: "composed",
    data: [
      { month: "Jan", revenue: 4000, profit: 2400, orders: 150 },
      { month: "Feb", revenue: 3000, profit: 1398, orders: 130 },
      { month: "Mar", revenue: 2000, profit: 9800, orders: 200 },
      { month: "Apr", revenue: 2780, profit: 3908, orders: 180 },
      { month: "May", revenue: 1890, profit: 4800, orders: 160 },
      { month: "Jun", revenue: 2390, profit: 3800, orders: 170 },
    ],
    series: [
      {
        type: "bar",
        dataKey: "revenue",
        name: "Revenue",
        style: { fill: "#8884d8" },
      },
      {
        type: "bar",
        dataKey: "profit",
        name: "Profit",
        style: { fill: "#82ca9d" },
      },
      {
        type: "bar",
        dataKey: "orders",
        name: "Orders",
        style: { stroke: "#ff7300" },
      },
    ],
    xAxis: { dataKey: "month" },
    yAxis: {},
    showGrid: true,
    showTooltip: true,
    showLegend: true,
    width: "100%",
    height: 300,
  }

  // Add TreeMap chart configuration
  const treeMapChartConfig: ChartConfig = {
    type: "treemap",
    data: [
      {
        name: "Frontend",
        size: 400,
        children: [
          { name: "React", size: 150 },
          { name: "Vue", size: 100 },
          { name: "Angular", size: 80 },
          { name: "Svelte", size: 70 },
        ],
      },
      {
        name: "Backend",
        size: 300,
        children: [
          { name: "Node.js", size: 120 },
          { name: "Python", size: 100 },
          { name: "Java", size: 80 },
        ],
      },
      {
        name: "Database",
        size: 200,
        children: [
          { name: "MongoDB", size: 80 },
          { name: "PostgreSQL", size: 70 },
          { name: "Redis", size: 50 },
        ],
      },
    ],
    series: [
      {
        type: "bar",
        dataKey: "size",
        name: "Technology Stack",
      },
    ],
    showTooltip: true,
    width: "100%",
    height: 300,
    themeConfig: {
      Frontend: { label: "Frontend", color: "hsl(var(--chart-1))" },
      Backend: { label: "Backend", color: "hsl(var(--chart-2))" },
      Database: { label: "Database", color: "hsl(var(--chart-3))" },
    },
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-4">
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded"
          onClick={() => installPackages(["numpy"])}
          disabled={isLoading}
        >
          Install NumPy
        </button>
        <button
          className="px-4 py-2 bg-green-500 text-white rounded"
          onClick={() => runPythonCode('print("Hello from Python!")')}
          disabled={isLoading}
        >
          Run Hello World
        </button>
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <textarea
            className="w-full h-[200px] p-2 font-mono border rounded"
            placeholder="Enter Python code here..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.ctrlKey) {
                runPythonCode(e.currentTarget.value)
              }
            }}
          />
        </div>
        <div className="flex-1">
          <pre className="w-full h-[200px] p-2 bg-gray-100 rounded overflow-auto">
            {output || "Output will appear here..."}
          </pre>
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="font-bold mb-2">File Hash Demo:</h3>
        <input
          type="file"
          onChange={(e) => handleFileUpload(e.target.files?.[0])}
        />
      </div>

      <div className="border-t pt-4">
        <h3 className="font-bold mb-2">Chart Examples:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="mb-2">Line Chart</h4>
            <Chart {...lineChartConfig} />
          </div>
          <div>
            <h4 className="mb-2">Pie Chart</h4>
            <Chart {...pieChartConfig} />
          </div>
          <div>
            <h4 className="mb-2">Bar Chart</h4>
            <Chart {...barChartConfig} />
          </div>
          <div>
            <h4 className="mb-2">Bar & Line Chart</h4>
            <Chart {...barLineChartConfig} />
          </div>
          <div>
            <h4 className="mb-2">Radar Chart</h4>
            <Chart {...radarChartConfig} />
          </div>
          <div>
            <h4 className="mb-2">Area Chart</h4>
            <Chart {...areaChartConfig} />
          </div>
          <div>
            <h4 className="mb-2">Scatter Chart</h4>
            <Chart {...scatterChartConfig} />
          </div>
          <div>
            <h4 className="mb-2">Composed Chart</h4>
            <Chart {...composedChartConfig} />
          </div>
          <div>
            <h4 className="mb-2">TreeMap Chart</h4>
            <Chart {...treeMapChartConfig} />
          </div>
        </div>
      </div>
    </div>
  )
}
