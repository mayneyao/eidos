import { constants } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import ignore, { type Ignore } from "ignore"

type Rules = { base: string; matcher: Ignore }
type Directory = { excluded: boolean; rules: Rules[] }

/** Per-scan, directory-scoped rules. No Git executable or repository mutation. */
export function explorerGitignoreFilter(root: string, scope: string | null) {
  const directories = new Map<string, Promise<Directory>>()
  const matches = (rules: Rules[], relative: string, directory: boolean) => {
    let excluded = false
    for (const { base, matcher } of rules) {
      const local = base ? relative.slice(base.length + 1) : relative
      const result = matcher.test(local + (directory ? "/" : ""))
      if (result.ignored) excluded = true
      else if (result.unignored) excluded = false
    }
    return excluded
  }
  const load = (relative: string): Promise<Directory> => {
    let pending = directories.get(relative)
    if (!pending) {
      pending = (async () => {
        const parent = relative
          ? await load(
              path.posix.dirname(relative) === "."
                ? ""
                : path.posix.dirname(relative)
            )
          : { excluded: false, rules: [] }
        if (
          parent.excluded ||
          (relative && matches(parent.rules, relative, true))
        )
          return { excluded: true, rules: parent.rules }
        const filename = path.join(root, relative, ".gitignore")
        try {
          const stat = await fs.lstat(filename)
          if (!stat.isFile() || stat.isSymbolicLink()) return parent
          const handle = await fs.open(
            filename,
            constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
          )
          try {
            if ((await handle.stat()).size > 64 * 1024)
              throw new Error(".gitignore is larger than 64 KB")
            const buffer = Buffer.alloc(64 * 1024 + 1)
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
            if (bytesRead > 64 * 1024)
              throw new Error(".gitignore is larger than 64 KB")
            const content = buffer.toString("utf8", 0, bytesRead)
            return {
              excluded: false,
              rules: [
                ...parent.rules,
                {
                  base: relative,
                  matcher: ignore({ ignorecase: false }).add(content),
                },
              ],
            }
          } finally {
            await handle.close()
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return parent
          throw error
        }
      })()
      directories.set(relative, pending)
    }
    return pending
  }
  const filter = async (
    paths: readonly string[],
    directoryPaths: ReadonlySet<string>
  ): Promise<ReadonlySet<string>> => {
    const ignored = new Set<string>()
    await Promise.all(
      paths.map(async (relative) => {
        const target = scope ? `${scope}/${relative}` : relative
        const parent = path.posix.dirname(target)
        const context = await load(parent === "." ? "" : parent)
        if (
          context.excluded ||
          matches(context.rules, target, directoryPaths.has(relative))
        )
          ignored.add(relative)
      })
    )
    return ignored
  }
  return Object.assign(filter, {
    async scopeExcluded() {
      return scope ? (await load(scope)).excluded : false
    },
  })
}
