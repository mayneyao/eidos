import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"

import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

import { useCMDKStore } from "./store"

export { useCMDKStore }
export type { ISearchNodes } from "./store"

export const useCMDKGoto = () => {
  const { navigate } = useRouterAdapter()
  const { setCmdkOpen } = useAppRuntimeStore()
  const goto = (path: string) => () => {
    setCmdkOpen(false)
    navigate(path)
  }
  return goto
}

export const useInput = () => {
  const { input, setInput } = useCMDKStore()
  const isActionMode = input.startsWith("/")
  const isSystemMode = input.startsWith("!")
  const isEmbeddingMode = input.startsWith("@")
  const mode = isActionMode
    ? "action"
    : isSystemMode
      ? "syscall"
      : isEmbeddingMode
        ? "embedding"
        : "search"
  return {
    input,
    setInput,
    mode,
  }
}
