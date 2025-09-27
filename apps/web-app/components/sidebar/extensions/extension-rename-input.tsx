import { useEffect, useRef } from "react"

interface ExtensionRenameInputProps {
  extensionId: string
  currentSlug: string
  extensionType: string
  onConfirm: (newSlug: string) => void
  onCancel: () => void
}

export const ExtensionRenameInput = ({
  extensionId,
  currentSlug,
  extensionType,
  onConfirm,
  onCancel,
}: ExtensionRenameInputProps) => {
  const editableRef = useRef<HTMLSpanElement>(null)

  // Initialize contentEditable content when entering rename mode
  useEffect(() => {
    if (editableRef.current) {
      const element = editableRef.current
      element.textContent = currentSlug

      // Use setTimeout to ensure DOM is updated before focusing and selecting
      setTimeout(() => {
        element.focus()

        // Select all text
        const range = document.createRange()
        range.selectNodeContents(element)
        const selection = window.getSelection()
        if (selection) {
          selection.removeAllRanges()
          selection.addRange(range)
        }
      }, 0)
    }
  }, [currentSlug])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      e.stopPropagation()
      const newText = e.currentTarget.textContent || ""
      onConfirm(newText)
    } else if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      // Reset content to original value
      e.currentTarget.textContent = currentSlug
      onCancel()
    }
    // For all other keys, let the default behavior happen (typing)
  }

  const handleBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    const newText = e.currentTarget.textContent || ""
    onConfirm(newText)
  }

  const handleInput = (e: React.FormEvent<HTMLSpanElement>) => {
    // Update React state as user types, but don't interfere with contentEditable
    const newText = e.currentTarget.textContent || ""
    // This could be used for validation if needed
  }

  return (
    <div className="flex items-center gap-2 rounded-sm px-2 py-1 text-sm transition-colors w-full text-foreground bg-muted/80">
      <span
        ref={editableRef}
        contentEditable={true}
        suppressContentEditableWarning={true}
        className="flex-1 outline-none cursor-text"
        data-extension-id={extensionId}
        tabIndex={0}
        spellCheck={false}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onInput={handleInput}
      >
        {/* Initial content set by useEffect, then controlled by user input */}
      </span>
      <span className="text-xs text-muted-foreground flex-shrink-0">
        .{extensionType === "script" ? "ts" : "tsx"}
      </span>
    </div>
  )
}
