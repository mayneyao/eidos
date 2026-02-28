"use client"

import { Clipboard, X } from "lucide-react"
import { ClipboardInspector } from "./clipboard-inspector"

interface ClipboardPanelProps {
  isVisible: boolean
  onClose: () => void
}

export function ClipboardPanel({ isVisible, onClose }: ClipboardPanelProps) {
  if (!isVisible) return null

  return (
    <div
      className="fixed z-50 bg-gray-900/95 backdrop-blur-sm text-white rounded-2xl shadow-2xl border border-gray-700 overflow-hidden"
      style={{
        left: "50%",
        bottom: "80px",
        transform: "translateX(-50%)",
        width: "400px",
        maxHeight: "500px",
      }}
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-6 h-6 bg-gradient-to-br from-green-500 to-blue-500 rounded-md flex items-center justify-center">
              <Clipboard className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                Clipboard Inspector
              </h2>
              <p className="text-xs text-gray-400">
                Inspect clipboard contents
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="p-6 max-h-80 overflow-y-auto">
        <ClipboardInspector />
      </div>
    </div>
  )
}
