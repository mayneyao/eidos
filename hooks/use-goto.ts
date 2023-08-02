import { useNavigate } from "react-router-dom"

export const useGoto = () => {
  const router = useNavigate()
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
