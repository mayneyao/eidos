import { useRouter } from "next/navigation"

export const useGoto = () => {
  const router = useRouter()
  return (space: string, tableName?: string) => {
    const path = tableName ? `/${space}/${tableName}` : `/${space}`
    router.push(path)
  }
}
