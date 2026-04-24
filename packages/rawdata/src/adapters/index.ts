import type { RawDataAdapter } from "../types.js"

// Import built-in (first-party) adapters
import githubRepos from "./github.com/repos.js"
import githubStars from "./github.com/stars.js"
import xBookmarks from "./x.com/bookmarks.js"
import ituringShelf from "./www.ituring.com.cn/shelf.js"
import bilibiliFavorites from "./www.bilibili.com/favorites.js"
import bilibiliBangumi from "./www.bilibili.com/bangumi.js"
import wereadShelf from "./weread.qq.com/shelf.js"

/**
 * Built-in rawdata adapters shipped with the framework.
 * These can be overridden by user-defined adapters in ~/.eidos/.rawdata/
 */
export const builtInAdapters: Map<string, RawDataAdapter> = new Map([
  ["built-in:github.com/repos", githubRepos],
  ["built-in:github.com/stars", githubStars],
  ["built-in:x.com/bookmarks", xBookmarks],
  ["built-in:ituring/shelf", ituringShelf],
  ["built-in:bilibili.com/favorites", bilibiliFavorites],
  ["built-in:bilibili.com/bangumi", bilibiliBangumi],
  ["built-in:weread.qq.com/shelf", wereadShelf],
])
