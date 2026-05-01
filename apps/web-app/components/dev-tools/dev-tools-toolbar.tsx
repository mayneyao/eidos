"use client"

import { Clipboard, BarChart3, Globe } from "lucide-react"

interface DevToolsToolbarProps {
  isClipboardVisible: boolean
  isPerformanceVisible: boolean
  currentUrl?: string
  onToggleClipboard: () => void
  onTogglePerformance: () => void
  onCopyDebugInfo: () => void
}

export function DevToolsToolbar({
  isClipboardVisible,
  isPerformanceVisible,
  currentUrl,
  onToggleClipboard,
  onTogglePerformance,
  onCopyDebugInfo,
}: DevToolsToolbarProps) {
  const copyUrl = () => {
    if (currentUrl) {
      navigator.clipboard.writeText(currentUrl)
    }
  }

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 max-w-[90vw]">
      <div className="flex items-center space-x-2 bg-gray-900/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg border border-gray-700 overflow-hidden">
        {/* Breakpoint display */}
        <div className="flex items-center space-x-2 px-3 py-1 bg-gray-800/50 rounded-full shrink-0">
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

        <div className="w-px h-4 bg-gray-600 shrink-0"></div>

        {/* URL display */}
        {currentUrl && (
          <div
            className="flex items-center space-x-2 px-3 py-1 bg-gray-800/50 rounded-full cursor-pointer hover:bg-gray-700/50 transition-colors max-w-[120px] sm:max-w-[200px] md:max-w-[400px] overflow-hidden"
            onClick={copyUrl}
            title={`Click to copy: ${currentUrl}`}
          >
            <Globe className="w-3 h-3 text-gray-400 shrink-0" />
            <span className="text-[10px] font-mono text-white truncate">
              {currentUrl}
            </span>
          </div>
        )}

        {currentUrl && <div className="w-px h-4 bg-gray-600 shrink-0"></div>}

        {/* Clipboard button */}
        <button
          onClick={onToggleClipboard}
          className={`text-gray-400 hover:text-white transition-colors shrink-0 ${
            isClipboardVisible ? "text-purple-400" : ""
          }`}
          title="Toggle Clipboard Inspector"
        >
          <Clipboard className="w-4 h-4" />
        </button>

        {/* Performance button */}
        <button
          onClick={onTogglePerformance}
          className={`text-gray-400 hover:text-white transition-colors shrink-0 ${
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
