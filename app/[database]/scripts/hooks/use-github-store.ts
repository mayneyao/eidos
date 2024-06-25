import { useEffect } from "react"
import { useLocalStorageState } from "ahooks"

import { getRawUrl } from "./use-github-script"

const storeRepoURL = "https://github.com/mayneyao/eidos-store"

export enum ExtensionTypeEnum {
  Script = "script",
  App = "app",
}

export interface IStoreExtItem {
  id: string
  name: string
  description: string
  version: string
  author: string
  repo: string
  type: ExtensionTypeEnum
}

type IStore = {
  scripts: IStoreExtItem[]
  apps: IStoreExtItem[]
}

const getExts = async () => {
  const eidosUrl = getRawUrl(storeRepoURL) + "/scripts.json"
  const response = await fetch(eidosUrl)
  const store = (await response.json()) as IStore
  return [
    ...store.scripts.map((script) => ({
      ...script,
      type: ExtensionTypeEnum.Script,
    })),
    ...store.apps.map((app) => ({
      ...app,
      type: ExtensionTypeEnum.App,
    })),
  ]
}

export const useGithubStore = () => {
  const [exts, setExts] = useLocalStorageState<IStoreExtItem[]>(
    "eidos-store",
    {
      defaultValue: [],
    }
  )

  useEffect(() => {
    getExts().then(setExts)
  }, [setExts])

  return {
    exts,
  }
}
