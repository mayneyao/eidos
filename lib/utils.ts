import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { v4 as uuidv4 } from "uuid"

export { v4 as uuidv4 } from "uuid"

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

export const generateColumnName = () => {
  // random 4 characters
  return `cl_${Math.random().toString(36).substring(2, 6)}`
}

export const getRawDocNameById = (id: string) => {
  return `doc_${id}`
}

// uuidv4 remove - and _ to make it shorter
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
  const onejan = new Date(date.getFullYear(), 0, 1)
  return Math.ceil(
    ((date.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7
  )
}

/**
 *
 * @param weekNodeId yyyy-w[week]
 * @returns
 */
export const getDaysByYearWeek = (weekNodeId: string) => {
  const year = parseInt(weekNodeId.slice(0, 4))
  const week = parseInt(weekNodeId.slice(6))
  const d = new Date(year, 0, 1)
  const w = d.getDay()
  const target = w > 4 ? 1 : 0
  const day = d.getDate() + (w <= 4 ? 1 : 8) - w
  const days = []
  for (let i = 0; i < 7; i++) {
    const date = new Date(year, 0, day + (week - 1) * 7 + i + target)
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
  return shortenId(uuidv4())
}

// generate a random id with 8 characters
export const generateId = () => {
  return Math.random().toString(36).substring(2, 10)
}

export const isDayPageId = (id: string) => {
  return /^\d{4}-\d{2}-\d{2}$/g.test(id)
}

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

export const proxyImageURL = (url?: string) => {
  if (!url) {
    return ""
  }
  return `https://proxy.eidos.space?url=${url}`
}
