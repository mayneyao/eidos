import React, { useState } from "react"
import { HelpCircle, X } from "lucide-react"
import { getShortcutHelp } from "../hooks/use-keyboard-shortcuts"

/**
 * Shortcut help component
 * Displays available keyboard shortcuts
 */
export const ShortcutHelp: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  const shortcuts = getShortcutHelp()

  const toggleHelp = () => {
    setIsOpen(!isOpen)
  }

  return (
    <>
      <button
        onClick={toggleHelp}
        className="fixed bottom-4 right-4 p-2 bg-gray-800 dark:bg-gray-700 text-white rounded-full shadow-lg hover:bg-gray-700 dark:hover:bg-gray-600 z-10"
        title="Keyboard shortcut help"
      >
        <HelpCircle size={20} />
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-96 max-w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-medium">Keyboard Shortcuts</h3>
              <button
                onClick={toggleHelp}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              <table className="w-full">
                <tbody>
                  {shortcuts.map((shortcut, index) => (
                    <tr key={index} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                      <td className="py-2 pr-4">
                        <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">
                          {shortcut.key}
                        </kbd>
                      </td>
                      <td className="py-2 text-sm">{shortcut.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default ShortcutHelp
