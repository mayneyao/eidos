import { useEffect } from "react"
import { useMultiFileEditorStore } from "../store"

/**
 * Keyboard shortcuts management Hook
 * Handles global keyboard shortcuts
 */
export const useKeyboardShortcuts = () => {
  const {
    openFiles,
    activeFileId,
    setActiveFileId,
    closeFile,
  } = useMultiFileEditorStore()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey

      // Ctrl/Cmd + W: Close current tab
      if (isCtrlOrCmd && e.key === "w") {
        e.preventDefault()
        if (activeFileId) {
          closeFile(activeFileId)
        }
        return
      }

      // Ctrl/Cmd + Tab: Switch to next tab
      if (isCtrlOrCmd && e.key === "Tab") {
        e.preventDefault()
        if (openFiles.length > 1 && activeFileId) {
          const currentIndex = openFiles.indexOf(activeFileId)
          const nextIndex = (currentIndex + 1) % openFiles.length
          setActiveFileId(openFiles[nextIndex])
        }
        return
      }

      // Ctrl/Cmd + Shift + Tab: Switch to previous tab
      if (isCtrlOrCmd && e.shiftKey && e.key === "Tab") {
        e.preventDefault()
        if (openFiles.length > 1 && activeFileId) {
          const currentIndex = openFiles.indexOf(activeFileId)
          const prevIndex = currentIndex === 0 ? openFiles.length - 1 : currentIndex - 1
          setActiveFileId(openFiles[prevIndex])
        }
        return
      }

      // Ctrl/Cmd + 1-9: Switch to tab at specified index
      if (isCtrlOrCmd && e.key >= "1" && e.key <= "9") {
        e.preventDefault()
        const index = parseInt(e.key) - 1
        if (index < openFiles.length) {
          setActiveFileId(openFiles[index])
        }
        return
      }

      // Ctrl/Cmd + Shift + P: Command palette (reserved)
      if (isCtrlOrCmd && e.shiftKey && e.key === "P") {
        e.preventDefault()
        console.log("Command palette (not implemented yet)")
        return
      }

      // Ctrl/Cmd + P: Quick open file (reserved)
      if (isCtrlOrCmd && e.key === "p" && !e.shiftKey) {
        e.preventDefault()
        console.log("Quick open (not implemented yet)")
        return
      }

      // Ctrl/Cmd + N: New file (reserved)
      if (isCtrlOrCmd && e.key === "n") {
        e.preventDefault()
        console.log("New file (not implemented yet)")
        return
      }

      // Ctrl/Cmd + Shift + N: New folder (reserved)
      if (isCtrlOrCmd && e.shiftKey && e.key === "N") {
        e.preventDefault()
        console.log("New folder (not implemented yet)")
        return
      }

      // F2: Rename file (reserved)
      if (e.key === "F2") {
        e.preventDefault()
        console.log("Rename file (not implemented yet)")
        return
      }

      // Delete: Delete file (reserved)
      if (e.key === "Delete") {
        e.preventDefault()
        console.log("Delete file (not implemented yet)")
        return
      }
    }

    // Add event listener
    document.addEventListener("keydown", handleKeyDown)

    // Cleanup function
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [openFiles, activeFileId, setActiveFileId, closeFile])
}

/**
 * Get shortcut help information
 */
export const getShortcutHelp = () => {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0
  const modKey = isMac ? "Cmd" : "Ctrl"

  return [
    { key: `${modKey} + S`, description: "Save file" },
    { key: `${modKey} + W`, description: "Close current tab" },
    { key: `${modKey} + Tab`, description: "Switch to next tab" },
    { key: `${modKey} + Shift + Tab`, description: "Switch to previous tab" },
    { key: `${modKey} + 1-9`, description: "Switch to tab at specified index" },
    { key: `${modKey} + N`, description: "New file" },
    { key: `${modKey} + Shift + N`, description: "New folder" },
    { key: `${modKey} + P`, description: "Quick open file" },
    { key: `${modKey} + Shift + P`, description: "Command palette" },
    { key: `${modKey} + /`, description: "Toggle comment" },
    { key: `Alt + Shift + F`, description: "Format document" },
    { key: "F2", description: "Rename file" },
    { key: "Delete", description: "Delete file" },
  ]
}
