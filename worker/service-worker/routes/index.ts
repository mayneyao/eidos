import aiHandle, { pathname } from "../ai"
import { backUpPullOnce, backUpPushOnce } from "../backup"
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
  {
    pathname: "/backup-push",
    handle: (event: FetchEvent) => {
      event.waitUntil(backUpPushOnce())
      return new Response("backup-push")
    },
  },
  {
    pathname: "/backup-pull",
    handle: (event: FetchEvent) => {
      event.waitUntil(backUpPullOnce())
      return new Response("backup-pull")
    },
  },
]
