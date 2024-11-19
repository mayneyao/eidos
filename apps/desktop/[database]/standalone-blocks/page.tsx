import { useEffect } from "react"
import { useParams, useSearchParams } from "react-router-dom"

import { useMblock } from "@/hooks/use-mblock"
import { BlockApp } from "@/components/block-renderer/block-app"

export default function BlockPage() {
  const { id, database } = useParams()
  const [searchParams] = useSearchParams()

  const block = useMblock(id)
  useEffect(() => {
    if (block) {
      // set title
      document.title = `Eidos - ${block.name}`
    }
  }, [block])
  return (
    <>
      <BlockApp url={`block://${id}@${database}?${searchParams.toString()}`} />
    </>
  )
}
