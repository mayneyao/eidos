import { useCallback, useEffect } from "react"

import { getAllSpaceNames } from "@/lib/opfs"

import { useSqliteStore } from "./use-sqlite"

export const useAllSpaces = () => {
  const { setSpaceList, spaceList } = useSqliteStore()

  const updateSpaceList = useCallback(async () => {
    const spaceNames = await getAllSpaceNames()
    setSpaceList(spaceNames)
  }, [setSpaceList])

  useEffect(() => {
    updateSpaceList()
  }, [setSpaceList, updateSpaceList])

  return {
    spaceList,
    updateSpaceList,
  }
}
