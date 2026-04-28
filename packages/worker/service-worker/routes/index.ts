import agentHandle, { pathname as agentPathname } from "../ai"
import extFileHandle, { pathname as extFileHandlePathname } from "./ext-file"
import { extHandle, pathname as extHandlePathname } from "./extensions"
import fileHandle, { pathname as fileHandlePathname } from "./file"
import staticFileHandle, {
  pathname as staticFileHandlePathname,
} from "./static-file"

export const routes = [
  {
    pathname: agentPathname,
    handle: agentHandle,
  },
  {
    pathname: extFileHandlePathname,
    handle: extFileHandle,
  },

  {
    pathname: fileHandlePathname,
    handle: fileHandle,
  },
  {
    pathname: staticFileHandlePathname,
    handle: staticFileHandle,
  },
  {
    pathname: extHandlePathname,
    handle: extHandle,
  },
]
