import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"

export const useCurrentSubPage = () => {
  const { searchParams, setSearchParams } = useRouterAdapter()
  //   ?v=1&p=2
  const subPageId = searchParams.get("p") ?? undefined
  const clearSubPage = () => {
    searchParams.delete("p")
    setSearchParams(searchParams)
  }
  const setSubPage = (id: string) => {
    searchParams.set("p", id)
    setSearchParams(searchParams)
  }
  return { subPageId, clearSubPage, setSubPage }
}
