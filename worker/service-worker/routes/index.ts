import aiHandle, { pathname } from "../ai"
import { backUpPullOnce, backUpPushOnce } from "../backup"
import aiCompletionHandle, {
  pathname as aiCompletionHandlePathname,
} from "./ai_completion"
import extFileHandle, { pathname as extFileHandlePathname } from "./ext-file"
import { extHandle, pathname as extHandlePathname } from "./extensions"
import fileHandle, { pathname as fileHandlePathname } from "./file"
import staticFileHandle, {
  pathname as staticFileHandlePathname,
} from "./static-file"

export const routes = [
  {
    pathname,
    handle: aiHandle,
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
