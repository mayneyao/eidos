import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";


import { uuidv7 } from "uuidv7";
export { uuidv7 } from "uuidv7";
import { v4 as uuidv4 } from "uuid"
import { EIDOS_PROXY_URL } from "./const";

export { uuidv4 }



export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


export const isUuidv4 = (id: string) => {
  // for performance, we only check the 15th character which is the version number
  return id[14] === "4"
}

export const isUuid = (id: string) => {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)
}

export function nonNullable<T>(value: T): value is NonNullable<T> {
  return value != null
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
export const getRawTableNameById = (id: string, isView: boolean = false) => {
  return isView ? `vw_${id}` : `tb_${id}`
}

export const getTableIdByRawTableName = (rawTableName: string) => {
  if (rawTableName.startsWith("tb_")) {
    return rawTableName.replace("tb_", "")
  }
  if (rawTableName.startsWith("vw_")) {
    return rawTableName.replace("vw_", "")
  }
  return rawTableName
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

export const getDate = (offset: number, baseDate?: Date | string) => {
  const date = baseDate ? new Date(baseDate) : new Date()
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

  // Get Jan 4 for the year (always in week 1 by ISO)
  const jan4th = new Date(year, 0, 4)

  // Get Monday of week 1
  const firstWeekMonday = new Date(jan4th)
  firstWeekMonday.setDate(jan4th.getDate() - (jan4th.getDay() || 7) + 1)

  // Calculate the start date of the requested week
  const startDate = new Date(firstWeekMonday)
  startDate.setDate(firstWeekMonday.getDate() + (week - 1) * 7)

  const days = []
  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate)
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
export const generateIdV7 = () => {
  return uuidv7().split("-").join("")
}

export const isDayPageId = (id: string | undefined) => {
  if (!id) return false
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
  return EIDOS_PROXY_URL + url
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

export const getBlockUrlWithParams = (id: string, params: Record<string, any>) => {
  const blockUrl = getBlockUrl(id)
  const blockUrlWithParams = new URL(blockUrl)
  Object.entries(params).forEach(([key, value]) => {
    blockUrlWithParams.searchParams.set(key, value)
  })
  return blockUrlWithParams.toString()
}

export const isStandaloneBlocksPath = (pathname: string) => {
  // /:space/standalone-blocks/:id
  return /^\/[\w-]+\/standalone-blocks\/[\w+-]+$/.test(pathname)
}

export const isExtensionURL = (url: string) => {
  // extension <extensionId>.block.<spaceId>.eidos.localhost:13127/
  // 287c3686-f1e1-4b10-965e-2daa35a422fc.block.25-w19.eidos.localhost:13127
  return url.endsWith('.eidos.localhost:13127')
}

/**
 * 
 * @param url http://287c3686-f1e1-4b10-965e-2daa35a422fc.block.25-w19.eidos.localhost:13127
 * return {
 *  id: '287c3686-f1e1-4b10-965e-2daa35a422fc',
 *  space: '25-w19',
 * }
 */
export const getInfoFromExtensionUrl = (url: string) => {
  const urlObj = new URL(url)
  const id = urlObj.hostname.split('.')[0]
  const space = urlObj.hostname.split('.')[2]
  return {
    id,
    space,
  }
}

export const getExtensionUrl = (id: string, space: string, searchParams?: Record<string, string>) => {
  const standaloneBlockUrl = new URL(
    `http://${id}.block.${space}.eidos.localhost:13127`
  )
  let newUrl = standaloneBlockUrl.toString()
  const searchParamsString = new URLSearchParams(searchParams).toString()
  if (searchParamsString) {
    newUrl += `?${searchParamsString}`
  }
  return newUrl
}
export const isFilesPath = (pathname: string) => {
  // /:space/files/:id - now supports file names with special characters and subdirectories
  return /^\/[\w-]+\/files\/.*$/.test(pathname)
}


interface ApplicationError extends Error {
  info: string;
  status: number;
}

export const fetcher = async (url: string) => {
  const res = await fetch(url);

  if (!res.ok) {
    const error = new Error(
      'An error occurred while fetching the data.',
    ) as ApplicationError;

    error.info = await res.json();
    error.status = res.status;

    throw error;
  }

  return res.json();
};

export const serializePropsToUrl = (props: Record<string, any>, url: string) => {
  const urlObj = new URL(url)
  Object.entries(props).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      urlObj.searchParams.set(key, '')
      return
    }

    const valueType = typeof value

    if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
      urlObj.searchParams.set(key, String(value))
    } else if (valueType === 'object' || Array.isArray(value)) {
      // Add a prefix to indicate this is JSON data
      urlObj.searchParams.set(key, `__JSON__:${JSON.stringify(value)}`)
    } else {
      // Fallback to string conversion for other types
      urlObj.searchParams.set(key, String(value))
    }
  })
  return urlObj.toString()
}

export const deserializePropsFromUrl = (url: string | URL): Record<string, any> => {
  const urlObj = typeof url === 'string' ? new URL(url) : url
  const props: Record<string, any> = {}

  urlObj.searchParams.forEach((value, key) => {
    if (!value) {
      props[key] = value
      return
    }

    // Check if the value has our JSON prefix
    if (value.startsWith('__JSON__:')) {
      const jsonString = value.substring(9) // Remove '__JSON__:' prefix
      try {
        props[key] = JSON.parse(jsonString)
      } catch (e) {
        console.error(`Failed to parse JSON for key "${key}":`, e)
        // Fallback to the original value without prefix
        props[key] = jsonString || value
      }
    } else {
      // Try to automatically detect and parse common data types
      if (value === 'true') {
        props[key] = true
      } else if (value === 'false') {
        props[key] = false
      } else if (value === 'null') {
        props[key] = null
      } else if (value === 'undefined') {
        props[key] = undefined
      } else if (!isNaN(Number(value)) && value.trim() !== '' && !isNaN(parseFloat(value))) {
        // Check if it's a number (integer or float)
        const numValue = Number(value)
        props[key] = Number.isInteger(numValue) ? parseInt(value, 10) : numValue
      } else {
        // Keep as string
        props[key] = value
      }
    }
  })

  return props
}