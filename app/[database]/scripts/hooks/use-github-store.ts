import { useEffect } from "react"
import { useLocalStorageState } from "ahooks"

import { getRawUrl } from "./use-github-script"

const storeRepoURL = "https://github.com/mayneyao/eidos-store"

interface IStoreScriptItem {
  id: string
  name: string
  description: string
  version: string
  author: string
  repo: string
}

const getScripts = async () => {
  const eidosUrl = getRawUrl(storeRepoURL) + "/scripts.json"
  const response = await fetch(eidosUrl)
  const store = await response.json()
  return store.scripts
}

export const useGithubStore = () => {
  const [scripts, setScripts] = useLocalStorageState<IStoreScriptItem[]>(
    "eidos-store",
    {
      defaultValue: [],
    }
  )

  useEffect(() => {
    getScripts().then(setScripts)
  }, [setScripts])

  return {
    scripts,
  }
}
