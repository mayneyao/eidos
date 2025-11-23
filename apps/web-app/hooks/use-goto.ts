import { useCallback } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

import { useCurrentPathInfo } from "./use-current-pathinfo"

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

export const useGotoCurrentSpaceHome = () => {
  const router = useNavigate()
  const { space } = useCurrentPathInfo()
  return () => {
    // Workspace identified by subdomain, path doesn't include space
    router("/")
  }
}
export const useGoto = () => {
  const router = useNavigate()
  const { isShareMode } = useAppRuntimeStore()
  const [searchParams] = useSearchParams()

  const gotoAtShareMode = useCallback(
    (space: string, tableName?: string, rowId?: string) => {
      let path = `/share/${space}`
      if (tableName) {
        path += `/${tableName}`
      }
      if (rowId) {
        path += `?p=${rowId}`
      }
      path += `?${searchParams.toString()}`
      router(path)
    },
    [router, searchParams]
  )

  const goto = useCallback(
    (space: string, tableName?: string, rowId?: string) => {
      // Workspace identified by subdomain, path doesn't include space
      let path = ""
      if (tableName) {
        path += `/${tableName}`
      }
      if (rowId) {
        path += `?p=${rowId}`
      }
      router(path)
    },
    [router]
  )

  if (isShareMode) {
    return gotoAtShareMode
  }
  return goto
}
