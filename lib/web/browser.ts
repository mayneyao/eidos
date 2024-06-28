/**
 * check if the browser is chromium based
 * @returns boolean
 */
export const isBrowserSupported = () => {
  const userAgent = window.navigator.userAgent.toLowerCase()
  return userAgent.includes("chrome") || userAgent.includes("chromium")
}

export const getBrowserVersion = () => {
  const userAgent = window.navigator.userAgent.toLowerCase()
  const version = userAgent.match(/(chrome|chromium)\/(\d+)/)
  return version ? parseInt(version[2]) : 0
}

export const isOPFSupported = async () => {
  try {
    await navigator.storage.getDirectory()
    return true
  } catch (error) {
    return false
  }
}

/**
 * check if core web apis are supported
 * 1. crypto
 * 2. showOpenFilePicker
 * 3. showDirectoryPicker
 * @returns boolean
 */
export const isCoreWebApisSupported = () => {
  const APIs = ["crypto", "showOpenFilePicker", "showDirectoryPicker"]

  return APIs.every((api) => window.hasOwnProperty(api))
}
