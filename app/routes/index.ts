import aiHandle, { pathname } from "./ai"
import fileHandle, { pathname as fileHandlePathname } from "./file"

export const routes = [
  {
    pathname,
    handle: aiHandle,
  },
  {
    pathname: fileHandlePathname,
    handle: fileHandle,
  },
]
