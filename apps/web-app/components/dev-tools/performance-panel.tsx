"use client"

import { BarChart3, X } from "lucide-react"

interface PerformancePanelProps {
  isVisible: boolean
  onClose: () => void
  nodeCount: number
  fps: number
  memoryUsage: {
    used: number
    total: number
    limit: number
    percentage: number
  }
}

export function PerformancePanel({
  isVisible,
  onClose,
  nodeCount,
  fps,
  memoryUsage,
}: PerformancePanelProps) {
  if (!isVisible) return null

  return (
    <div
      className="fixed z-50 bg-gray-900/95 backdrop-blur-sm text-white rounded-lg shadow-2xl border border-gray-700 overflow-hidden"
      style={{
        right: "16px",
        bottom: "16px",
        width: "280px",
        maxHeight: "400px",
      }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 bg-gradient-to-br from-blue-500 to-cyan-500 rounded flex items-center justify-center">
              <BarChart3 className="w-3 h-3 text-white" />
            </div>
            <h3 className="text-sm font-semibold text-white">Performance</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Performance metrics */}
      <div className="p-4 space-y-4">
        {/* HTML nodes */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">DOM Nodes:</span>
          <span className="text-xs font-mono text-blue-400">
            {nodeCount.toLocaleString()}
          </span>
        </div>

        {/* FPS */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">FPS:</span>
          <span
            className={`text-xs font-mono font-bold ${
              fps >= 55
                ? "text-green-400"
                : fps >= 30
                  ? "text-yellow-400"
                  : "text-red-400"
            }`}
          >
            {fps}
          </span>
        </div>

        {/* Memory usage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Memory:</span>
            <span
              className={`text-xs font-mono font-bold ${
                memoryUsage.percentage >= 80
                  ? "text-red-400"
                  : memoryUsage.percentage >= 60
                    ? "text-yellow-400"
                    : "text-green-400"
              }`}
            >
              {memoryUsage.used}MB / {memoryUsage.limit}MB
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${
                memoryUsage.percentage >= 80
                  ? "bg-red-400"
                  : memoryUsage.percentage >= 60
                    ? "bg-yellow-400"
                    : "bg-green-400"
              }`}
              style={{ width: `${Math.min(memoryUsage.percentage, 100)}%` }}
            ></div>
          </div>
          <div className="text-right">
            <span className="text-xs text-gray-500">
              {memoryUsage.percentage}% used
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
