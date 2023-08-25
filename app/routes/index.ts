import aiHandle, { pathname } from "./ai"
import aiCompletionHandle, {
  pathname as aiCompletionHandlePathname,
} from "./ai_completion"
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
]
