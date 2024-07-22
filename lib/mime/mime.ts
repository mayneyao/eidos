import * as db from "mime-db"
import { extname } from "path-browserify"

/**
 * source: https://github.com/jshttp/mime-types/blob/master/index.js
 * refactored to typescript via copilot
 * js => ts
 * path => path-browserify
 */

/*!
 * mime-types
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */

/**
 * Get the default charset for a MIME type.
 *
 * @param {string} type
 * @return {boolean|string}
 */
export const charset = (type: string): boolean | string => {
  if (!type || typeof type !== "string") {
    return false
  }

  // TODO: use media-typer
  const match = /^\s*([^;\s]*)(?:;|\s|$)/.exec(type)
  const mime = match && db[match[1].toLowerCase()]

  if (mime && mime.charset) {
    return mime.charset
  }

  // default text/* to utf-8
  if (match && /^text\//i.test(match[1])) {
    return "UTF-8"
  }

  return false
}

/**
 * Create a full Content-Type header given a MIME type or extension.
 *
 * @param {string} str
 * @return {boolean|string}
 */
export const contentType = (str: string): boolean | string => {
  // TODO: should this even be in this module?
  if (!str || typeof str !== "string") {
    return false
  }

  let mime = str.indexOf("/") === -1 ? lookup(str) : str

  if (!mime) {
    return false
  }
  if (typeof mime === "boolean") {
    return mime
  }

  // TODO: use content-type or other module
  if (mime.indexOf("charset") === -1) {
    const charsetValue = charset(mime)
    if (charsetValue) {
      mime += "; charset=" + (charsetValue as string).toLowerCase()
    }
  }

  return mime
}

/**
 * Get the default extension for a MIME type.
 *
 * @param {string} type
 * @return {boolean|string}
 */
export const extension = (type: string): boolean | string => {
  if (!type || typeof type !== "string") {
    return false
  }

  // TODO: use media-typer
  const match = /^\s*([^;\s]*)(?:;|\s|$)/.exec(type)

  // get extensions
  const exts = match && db[match[1].toLowerCase()]?.extensions

  if (!exts || !exts.length) {
    return false
  }

  return exts[0]
}

/**
 * Lookup the MIME type for a file path/extension.
 *
 * @param {string} path
 * @return {boolean|string}
 */
export const lookup = (path: string): boolean | string => {
  if (!path || typeof path !== "string") {
    return false
  }

  // get the extension ("ext" or ".ext" or full path)
  const extensionValue = extname("x." + path)
    .toLowerCase()
    .slice(1)

  if (!extensionValue) {
    return false
  }

  let type = types[extensionValue] || false
  // rewrite application/mp4 to video/mp4
  if (type && type.startsWith("application/") && type.endsWith("mp4")) {
    type = type.replace("application/", "video/")
  }
  return type
}

/**
 * Populate the extensions and types maps.
 * @private
 */
const populateMaps = (
  extensions: { [key: string]: string[] },
  types: { [key: string]: string }
) => {
  // source preference (least -> most)
  const preference: (string | undefined)[] = [
    "nginx",
    "apache",
    undefined,
    "iana",
  ]

  Object.keys(db).forEach((type) => {
    const mime = db[type]
    const exts = mime.extensions

    if (!exts || !exts.length) {
      return
    }

    // mime -> extensions
    extensions[type] = exts as string[]

    // extension -> mime
    for (let i = 0; i < exts.length; i++) {
      const extension = exts[i]

      if (types[extension]) {
        const from = preference.indexOf(db[types[extension]].source)
        const to = preference.indexOf(mime.source)

        if (
          types[extension] !== "application/octet-stream" &&
          (from > to ||
            (from === to && types[extension].slice(0, 12) === "application/"))
        ) {
          // skip the remapping
          continue
        }
      }

      // set the extension -> mime
      types[extension] = type
    }
  })
}

export const extensions: { [key: string]: string[] } = Object.create(null)
export const types: { [key: string]: string } = Object.create(null)

// Populate the extensions/types maps
populateMaps(extensions, types)

export const getFileType = (
  url: string
): boolean | string | "image" | "audio" | "video" => {
  let fileType = lookup(url)

  if (!fileType) return false
  fileType = (fileType as string).split("/")[0]
  return fileType
}

const videoIconUrl =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTE1IDJINkM1LjQ2OTU3IDIgNC45NjA4NiAyLjIxMDcxIDQuNTg1NzkgMi41ODU3OUM0LjIxMDcxIDIuOTYwODYgNCAzLjQ2OTU3IDQgNFYyMEM0IDIwLjUzMDQgNC4yMTA3MSAyMS4wMzkxIDQuNTg1NzkgMjEuNDE0MkM0Ljk2MDg2IDIxLjc4OTMgNS40Njk1NyAyMiA2IDIySDE4QzE4LjUzMDQgMjIgMTkuMDM5MSAyMS43ODkzIDE5LjQxNDIgMjEuNDE0MkMxOS43ODkzIDIxLjAzOTEgMjAgMjAuNTMwNCAyMCAyMFY3TDE1IDJaIiBzdHJva2U9IiNBQUFBQUEiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+CjxwYXRoIGQ9Ik0xNCAyVjZDMTQgNi41MzA0MyAxNC4yMTA3IDcuMDM5MTQgMTQuNTg1OCA3LjQxNDIxQzE0Ljk2MDkgNy43ODkyOSAxNS40Njk2IDggMTYgOEgyMCIgc3Ryb2tlPSIjQUFBQUFBIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTAgMTFMMTUgMTRMMTAgMTdWMTFaIiBzdHJva2U9IiNBQUFBQUEiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+Cjwvc3ZnPgo="
const audioIconUrl =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTE3LjUgMjJIMThDMTguNTMwNCAyMiAxOS4wMzkxIDIxLjc4OTMgMTkuNDE0MiAyMS40MTQyQzE5Ljc4OTMgMjEuMDM5MSAyMCAyMC41MzA0IDIwIDIwVjdMMTUgMkg2QzUuNDY5NTcgMiA0Ljk2MDg2IDIuMjEwNzEgNC41ODU3OSAyLjU4NTc5QzQuMjEwNzEgMi45NjA4NiA0IDMuNDY5NTcgNCA0VjciIHN0cm9rZT0iI0FBQUFBQSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPHBhdGggZD0iTTE0IDJWNkMxNCA2LjUzMDQzIDE0LjIxMDcgNy4wMzkxNCAxNC41ODU4IDcuNDE0MjFDMTQuOTYwOSA3Ljc4OTI5IDE1LjQ2OTYgOCAxNiA4SDIwIiBzdHJva2U9IiNBQUFBQUEiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+CjxwYXRoIGQ9Ik0yIDE5QzIgMTguNDY5NiAyLjIxMDcxIDE3Ljk2MDkgMi41ODU3OSAxNy41ODU4QzIuOTYwODYgMTcuMjEwNyAzLjQ2OTU3IDE3IDQgMTdDNC41MzA0MyAxNyA1LjAzOTE0IDE3LjIxMDcgNS40MTQyMSAxNy41ODU4QzUuNzg5MjkgMTcuOTYwOSA2IDE4LjQ2OTYgNiAxOVYyMEM2IDIwLjUzMDQgNS43ODkyOSAyMS4wMzkxIDUuNDE0MjEgMjEuNDE0MkM1LjAzOTE0IDIxLjc4OTMgNC41MzA0MyAyMiA0IDIyQzMuNDY5NTcgMjIgMi45NjA4NiAyMS43ODkzIDIuNTg1NzkgMjEuNDE0MkMyLjIxMDcxIDIxLjAzOTEgMiAyMC41MzA0IDIgMjBWMTZDMiAxNC40MDg3IDIuNjMyMTQgMTIuODgyNiAzLjc1NzM2IDExLjc1NzRDNC44ODI1OCAxMC42MzIxIDYuNDA4NyAxMCA4IDEwQzkuNTkxMyAxMCAxMS4xMTc0IDEwLjYzMjEgMTIuMjQyNiAxMS43NTc0QzEzLjM2NzkgMTIuODgyNiAxNCAxNC40MDg3IDE0IDE2VjIwQzE0IDIwLjUzMDQgMTMuNzg5MyAyMS4wMzkxIDEzLjQxNDIgMjEuNDE0MkMxMy4wMzkxIDIxLjc4OTMgMTIuNTMwNCAyMiAxMiAyMkMxMS40Njk2IDIyIDEwLjk2MDkgMjEuNzg5MyAxMC41ODU4IDIxLjQxNDJDMTAuMjEwNyAyMS4wMzkxIDEwIDIwLjUzMDQgMTAgMjBWMTlDMTAgMTguNDY5NiAxMC4yMTA3IDE3Ljk2MDkgMTAuNTg1OCAxNy41ODU4QzEwLjk2MDkgMTcuMjEwNyAxMS40Njk2IDE3IDEyIDE3QzEyLjUzMDQgMTcgMTMuMDM5MSAxNy4yMTA3IDEzLjQxNDIgMTcuNTg1OEMxMy43ODkzIDE3Ljk2MDkgMTQgMTguNDY5NiAxNCAxOSIgc3Ryb2tlPSIjQUFBQUFBIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8L3N2Zz4K"
const fileIconUrl =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTE1IDJINkM1LjQ2OTU3IDIgNC45NjA4NiAyLjIxMDcxIDQuNTg1NzkgMi41ODU3OUM0LjIxMDcxIDIuOTYwODYgNCAzLjQ2OTU3IDQgNFYyMEM0IDIwLjUzMDQgNC4yMTA3MSAyMS4wMzkxIDQuNTg1NzkgMjEuNDE0MkM0Ljk2MDg2IDIxLjc4OTMgNS40Njk1NyAyMiA2IDIySDE4QzE4LjUzMDQgMjIgMTkuMDM5MSAyMS43ODkzIDE5LjQxNDIgMjEuNDE0MkMxOS43ODkzIDIxLjAzOTEgMjAgMjAuNTMwNCAyMCAyMFY3TDE1IDJaIiBzdHJva2U9IiNBQUFBQUEiIHN0cm9rZS1vcGFjaXR5PSIwLjgiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+CjxwYXRoIGQ9Ik0xNCAyVjZDMTQgNi41MzA0MyAxNC4yMTA3IDcuMDM5MTQgMTQuNTg1OCA3LjQxNDIxQzE0Ljk2MDkgNy43ODkyOSAxNS40Njk2IDggMTYgOEgyMCIgc3Ryb2tlPSIjQUFBQUFBIiBzdHJva2Utb3BhY2l0eT0iMC44IiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8L3N2Zz4K"

export const getFilePreviewImage = (url: string): string => {
  const fileType = getFileType(url)
  // show only image
  if (fileType !== "image") {
    switch (fileType) {
      case "audio":
        return audioIconUrl
      case "video":
        return videoIconUrl
      default:
        return fileIconUrl
    }
  }
  return url
}
