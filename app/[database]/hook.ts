import { useEffect } from "react"
import { useParams } from "next/navigation"

export const useTableChange = (callback: Function) => {
  const { database, table } = useParams()
  useEffect(() => {
    callback()
  }, [database, table])
}
