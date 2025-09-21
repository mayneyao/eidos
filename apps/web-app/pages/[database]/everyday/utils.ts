import {
  getToday,
  getTomorrow,
  getYesterday,
} from "@/lib/utils"

export const getDisplayTitle = (dayId: string) => {
  const today = getToday()
  const tomorrow = getTomorrow()
  const yesterday = getYesterday()
  
  if (dayId === today) return "Today"
  if (dayId === tomorrow) return "Tomorrow"
  if (dayId === yesterday) return "Yesterday"
  return dayId
}
