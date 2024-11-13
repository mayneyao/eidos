import { useParams } from "react-router-dom"

import { BlockApp } from "@/components/block-renderer/block-app"

export default function BlockPage() {
  const { id, database } = useParams()

  return (
    <>
      <BlockApp url={`block://${id}@${database}`} />
    </>
  )
}
