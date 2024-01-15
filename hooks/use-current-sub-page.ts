import { useSearchParams } from "react-router-dom"

export const useCurrentSubPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
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
