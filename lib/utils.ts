import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { uuidv7 } from "uuidv7"

export { uuidv7 } from "uuidv7"
// export { v4 as uuidv7 } from "uuid"

export const isUuidv4 = (id: string) => {
  // for performance, we only check the 15th character which is the version number
  return id[14] === "4"
}

export function nonNullable<T>(value: T): value is NonNullable<T> {
  return value != null
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const hashText = (text: string) => {
  let hash = 0
  if (text.length == 0) {
    return hash
  }
  for (let i = 0; i < text.length; i++) {
    let char = text.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash
}

export const checkIsInWorker = () => {
  return globalThis.self === globalThis
}

/**
 * pathname = /space1/5c5bf8539ee9434aa721560c89f34ed6
 * databaseName = space1
 * tableId = 5c5bf8539ee9434aa721560c89f34ed6
 * tableName = user custom name
 * rawTableName = tb_5c5bf8539ee9434aa721560c89f34ed6 (real table name in sqlite)
 * @param id
 * @returns
 */
export const getRawTableNameById = (id: string) => {
  return `tb_${id}`
}

export const getTableIdByRawTableName = (rawTableName: string) => {
  return rawTableName.replace("tb_", "")
}

export const getColumnIndexName = (tableName: string, columnName: string) => {
  return `idx__${tableName}__${columnName}`
}

export const generateColumnName = () => {
  // random 4 characters
  return `cl_${Math.random().toString(36).substring(2, 6)}`
}

export const getRawDocNameById = (id: string) => {
  return `doc_${id}`
}

// uuidv7 remove - and _ to make it shorter
export const shortenId = (id: string) => {
  return id.replace(/-/g, "").replace(/_/g, "")
}

export const extractIdFromShortId = (shortId: string) => {
  return `${shortId.slice(0, 8)}-${shortId.slice(8, 12)}-${shortId.slice(
    12,
    16
  )}-${shortId.slice(16, 20)}-${shortId.slice(20)}`
}

export const getDate = (offset: number) => {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, "0")
  const day = date.getDate().toString().padStart(2, "0")
  return `${year}-${month}-${day}`
}

export const getToday = () => getDate(0)

export const getYesterday = () => getDate(-1)

export const getTomorrow = () => getDate(1)

/**
 *
 * @param str yyyy-w[week]
 */
export const isWeekNodeId = (str?: string) => {
  if (!str) return false
  return /^\d{4}-w\d{1,2}$/g.test(str)
}

/**
 * get week of the year
 * @param day  yyyy-mm-dd || yyyy-w[week]
 * @returns
 */
export const getWeek = (day: string) => {
  if (isWeekNodeId(day)) {
    return parseInt(day.split("-w")[1])
  }
  const date = new Date(day)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7)
  const week1 = new Date(date.getFullYear(), 0, 4)
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
}

/**
 *
 * @param weekNodeId yyyy-w[week]
 * @returns
 */
export const getDaysByYearWeek = (weekNodeId: string) => {
  const year = parseInt(weekNodeId.slice(0, 4))
  const week = parseInt(weekNodeId.slice(6))

  // Find the first day of the year
  const firstDayOfYear = new Date(year, 0, 1)

  // Find the first Monday of the year
  const firstMonday = new Date(year, 0, 1 + (8 - firstDayOfYear.getDay()) % 7)

  // Calculate the start date of the requested week
  const startDate = new Date(firstMonday.getTime())
  startDate.setDate(firstMonday.getDate() + (week - 1) * 7)

  const days = []
  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate.getTime())
    date.setDate(startDate.getDate() + i)
    days.push(getLocalDate(date))
  }

  return days
}

export const getLocalDate = (date: Date) => {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, "0")
  const day = date.getDate().toString().padStart(2, "0")
  const localDate = `${year}-${month}-${day}`
  return localDate
}

export const getUuid = () => {
  return shortenId(uuidv7())
}

// generate a random id with 8 characters
export const generateId = () => {
  return Math.random().toString(36).substring(2, 10)
}

export const isDayPageId = (id: string) => {
  return /^\d{4}-\d{2}-\d{2}$/g.test(id)
}

/**
 * Returns a string representing the time elapsed since the given date.
 * @param date - The date to calculate the time elapsed from.
 * @returns A string representing the time elapsed in a human-readable format.
 */
export function timeAgo(date: Date) {
  const now = new Date().getTime()
  const diffInSeconds = Math.floor((now - date.getTime()) / 1000)

  if (diffInSeconds < 60) {
    return `${diffInSeconds} seconds ago`
  } else if (diffInSeconds < 3600) {
    return `${Math.floor(diffInSeconds / 60)} minutes ago`
  } else if (diffInSeconds < 86400) {
    return `${Math.floor(diffInSeconds / 3600)} hours ago`
  } else {
    return `${Math.floor(diffInSeconds / 86400)} days ago`
  }
}

export const proxyURL = (url?: string) => {
  if (!url) {
    return ""
  }
  return `https://proxy.eidos.space?url=${url}`
}


export const getBlockUrl = (blockId: string, props?: Record<string, any>) => {
  const url = new URL(`block://${blockId}`)
  if (props) {
    Object.entries(props).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
  }
  return url.toString()
}

export const getBlockIdFromUrl = (url: string) => {
  try {
    const blockId = url.replace('block://', '')
    return blockId.split('?')[0]
  } catch (error) {
    console.error(error)
    return ""
  }
}

export const isStandaloneBlocksPath = (pathname: string) => {
  // /:space/standalone-blocks/:id
  return /^\/[\w-]+\/standalone-blocks\/\w+$/.test(pathname)
}
