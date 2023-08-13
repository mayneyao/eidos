"use client"

import { useEffect } from "react"

import { useGoto } from "@/hooks/use-goto"
import { useSpace } from "@/hooks/use-space"
import { DatabaseSelect } from "@/components/database-select"

import { useLastOpened } from "./[database]/hook"

export default function IndexPage() {
  const { spaceList } = useSpace()
  const { lastOpenedDatabase } = useLastOpened()
  const goto = useGoto()

  useEffect(() => {
    if (lastOpenedDatabase) {
      goto(lastOpenedDatabase)
    }
  }, [lastOpenedDatabase, goto])
  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="w-[200px]">
        <DatabaseSelect databases={spaceList} />
      </div>
    </div>
  )
}
