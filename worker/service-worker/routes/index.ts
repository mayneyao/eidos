import aiHandle, { pathname } from "../ai"
import aiCompletionHandle, {
  pathname as aiCompletionHandlePathname,
} from "./ai_completion"
import { extHandle, pathname as extHandlePathname } from "./extensions"
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
  {
    pathname: aiCompletionHandlePathname,
    handle: aiCompletionHandle,
  },
  {
    pathname: extHandlePathname,
    handle: extHandle,
  },
]
