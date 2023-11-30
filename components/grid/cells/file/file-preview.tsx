import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

export const FilePreview = ({
  url,
  onClose,
}: {
  url: string
  onClose: () => void
}) => {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    const newContainer = document.createElement("div")
    document.body.appendChild(newContainer)
    setContainer(newContainer)

    return () => {
      document.body.removeChild(newContainer)
    }
  }, [])

  if (!container) {
    return null
  }

  return createPortal(
    <div
      className="click-outside-ignore"
      onClick={onClose} // Add this line
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        zIndex: 9999,
      }}
    >
      <img
        src={url}
        alt="preview"
        onClick={(e) => e.stopPropagation()} // Add this line
        style={{ maxWidth: "80%", maxHeight: "80%" }}
      />
    </div>,
    container
  )
}
