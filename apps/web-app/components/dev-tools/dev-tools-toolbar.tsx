"use client"

import { Clipboard, BarChart3 } from "lucide-react"

interface DevToolsToolbarProps {
  isClipboardVisible: boolean
  isPerformanceVisible: boolean
  onToggleClipboard: () => void
  onTogglePerformance: () => void
  onCopyDebugInfo: () => void
}

export function DevToolsToolbar({
  isClipboardVisible,
  isPerformanceVisible,
  onToggleClipboard,
  onTogglePerformance,
  onCopyDebugInfo,
}: DevToolsToolbarProps) {
  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
      <div className="flex items-center space-x-2 bg-gray-900/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg border border-gray-700">
        {/* Breakpoint display */}
        <div className="flex items-center space-x-2 px-3 py-1 bg-gray-800/50 rounded-full">
          <span className="text-xs text-gray-400">Breakpoint:</span>
          <span className="text-xs font-mono text-white">
            <span className="block sm:hidden">xs</span>
            <span className="hidden sm:block md:hidden">sm</span>
            <span className="hidden md:block lg:hidden">md</span>
            <span className="hidden lg:block xl:hidden">lg</span>
            <span className="hidden xl:block 2xl:hidden">xl</span>
            <span className="hidden 2xl:block">2xl</span>
          </span>
        </div>

        <div className="w-px h-4 bg-gray-600"></div>

        {/* Clipboard button */}
        <button
          onClick={onToggleClipboard}
          className={`text-gray-400 hover:text-white transition-colors ${
            isClipboardVisible ? "text-purple-400" : ""
          }`}
          title="Toggle Clipboard Inspector"
        >
          <Clipboard className="w-4 h-4" />
        </button>

        {/* Performance button */}
        <button
          onClick={onTogglePerformance}
          className={`text-gray-400 hover:text-white transition-colors ${
            isPerformanceVisible ? "text-blue-400" : ""
          }`}
          title="Toggle Performance Monitor"
        >
          <BarChart3 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
