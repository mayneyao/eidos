import { useCallback } from "react"
import { useRouterAdapter } from "./use-router-adapter"

import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

import { useCurrentPathInfo } from "./use-current-pathinfo"

export const useLink = () => {
  const { location } = useRouterAdapter()
  const searchParams = new URLSearchParams(location.search)
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
  const { navigate } = useRouterAdapter()
  const { space } = useCurrentPathInfo()
  return () => {
    // Workspace identified by subdomain, path doesn't include space
    navigate("/")
  }
}
export const useGoto = () => {
  const { navigate, location } = useRouterAdapter()
  const { isShareMode } = useAppRuntimeStore()
  const searchParams = new URLSearchParams(location.search)

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
      navigate(path)
    },
    [navigate, searchParams]
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
      navigate(path)
    },
    [navigate]
  )

  if (isShareMode) {
    return gotoAtShareMode
  }
  return goto
}
