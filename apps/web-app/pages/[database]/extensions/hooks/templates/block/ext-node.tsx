import { useState, useEffect } from "react"

export const meta = {
  type: "extNode",
  componentName: "MyExtNode",
  extNode: {
    title: "My Extension Node",
    description: "This is a custom extension node",
    type: "custom",
  },
}

export function MyExtNode() {
  const [content, setContent] = useState("")
  const nodeId = window.location.pathname.split('/')[1]

  useEffect(() => {
    eidos.currentSpace.extNode.getText(nodeId).then((text) => {
      setContent(text || "")
    })
  }, [nodeId])

  const handleSave = async (newContent) => {
    await eidos.currentSpace.extNode.setText(nodeId, newContent)
    setContent(newContent)
  }

  return (
    <div className="p-4">
      <h1>Custom Extension Node [{nodeId}]</h1>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onBlur={(e) => handleSave(e.target.value)}
        className="w-full h-64 p-2 border rounded"
        placeholder="Enter your content here..."
      />
    </div>
  )
}
