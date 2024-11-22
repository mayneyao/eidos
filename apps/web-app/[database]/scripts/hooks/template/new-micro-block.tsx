import { useState } from "react"

import { Button } from "@/components/ui/button"

function MyButton() {
  // tailwind css support
  return <button className="bg-red-300 p-2 rounded-md">I'm a button</button>
}

export default function MyBlock() {
  const [treeNodes, setTreeNodes] = useState([])
  const handleClick = async () => {
    const res = await eidos.currentSpace.tree.list({ is_deleted: false })
    setTreeNodes(res)
  }
  return (
    <div className="flex flex-col gap-4">
      <h1>Welcome to my block</h1>
      <MyButton />
      {/* shadcn component support */}
      <Button onClick={handleClick}>get nodes</Button>
      <hr />
      {treeNodes.map((node) => (
        <div key={node.id}>{node.name || "Untitled"}</div>
      ))}
    </div>
  )
}
