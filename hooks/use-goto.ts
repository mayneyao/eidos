import { useNavigate, useSearchParams } from "react-router-dom"

import { useAppRuntimeStore } from "@/lib/store/runtime-store"

export const useLink = () => {
  const [searchParams] = useSearchParams()
  const { isShareMode } = useAppRuntimeStore()

  const getLink = (pathname: string) => {
    if (isShareMode) {
      const newPathname = "/share" + pathname
      return newPathname + "?" + searchParams.toString()
    }
    return pathname
  }
  return { getLink }
}
export const useGoto = () => {
  const router = useNavigate()
  const { isShareMode } = useAppRuntimeStore()
  const [searchParams] = useSearchParams()

  if (isShareMode) {
    return (space: string, tableName?: string, rowId?: string) => {
      let path = `/share/${space}`
      if (tableName) {
        path += `/${tableName}`
      }
      if (rowId) {
        path += `?p=${rowId}`
      }
      path += `?${searchParams.toString()}`
      router(path)
    }
  }
  return (space: string, tableName?: string, rowId?: string) => {
    let path = `/${space}`
    if (tableName) {
      path += `/${tableName}`
    }
    if (rowId) {
      path += `?p=${rowId}`
    }
    router(path)
  }
}
