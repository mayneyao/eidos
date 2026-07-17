import type {
  SpaceVersionChange,
  SpaceVersionChangeStatus,
} from "@/apps/web-app/hooks/use-space-versioning"

export interface ChangeTreeNode {
  name: string
  path: string
  directory: boolean
  status: SpaceVersionChangeStatus
  change?: SpaceVersionChange
  children: ChangeTreeNode[]
}

const STATUS_PRIORITY: Record<SpaceVersionChangeStatus, number> = {
  conflicted: 6,
  deleted: 5,
  added: 4,
  renamed: 3,
  modified: 2,
  untracked: 1,
  unknown: 0,
}

// The tree synthesizes `.eidos` parents, but only host-approved product roots
// that are actually present in status may be sent back as mutation pathspecs.
const VERSIONED_EIDOS_ROOTS = [
  ".eidos/agent/sessions",
  ".eidos/extensions",
] as const

export const STATUS_META: Record<
  SpaceVersionChangeStatus,
  { label: string; shortLabel: string; className: string }
> = {
  added: {
    label: "Added",
    shortLabel: "A",
    className: "text-emerald-600 dark:text-emerald-400",
  },
  modified: {
    label: "Modified",
    shortLabel: "M",
    className: "text-amber-600 dark:text-amber-400",
  },
  deleted: {
    label: "Deleted",
    shortLabel: "D",
    className: "text-rose-600 dark:text-rose-400",
  },
  renamed: {
    label: "Renamed",
    shortLabel: "R",
    className: "text-sky-600 dark:text-sky-400",
  },
  untracked: {
    label: "Untracked",
    shortLabel: "U",
    className: "text-emerald-600 dark:text-emerald-400",
  },
  conflicted: {
    label: "Conflict",
    shortLabel: "!",
    className: "text-destructive",
  },
  unknown: {
    label: "Changed",
    shortLabel: "•",
    className: "text-muted-foreground",
  },
}

function strongerStatus(
  left: SpaceVersionChangeStatus,
  right: SpaceVersionChangeStatus
) {
  return STATUS_PRIORITY[left] >= STATUS_PRIORITY[right] ? left : right
}

export function buildChangeTree(
  changes: SpaceVersionChange[]
): ChangeTreeNode[] {
  const root: ChangeTreeNode = {
    name: "",
    path: "",
    directory: true,
    status: "unknown",
    children: [],
  }

  for (const change of changes) {
    const parts = change.path.split("/").filter(Boolean)
    let parent = root
    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index]
      const path = parts.slice(0, index + 1).join("/")
      const directory = index < parts.length - 1
      let node = parent.children.find(
        (candidate) =>
          candidate.name === name && candidate.directory === directory
      )
      if (!node) {
        node = {
          name,
          path,
          directory,
          status: change.status,
          children: [],
        }
        parent.children.push(node)
      }
      node.status = strongerStatus(node.status, change.status)
      if (!directory) node.change = change
      parent = node
    }
  }

  const sortNodes = (nodes: ChangeTreeNode[]) => {
    nodes.sort((left, right) => {
      if (left.directory !== right.directory) return left.directory ? -1 : 1
      return left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    })
    for (const node of nodes) sortNodes(node.children)
  }
  sortNodes(root.children)
  return root.children
}

export function collectDirectoryPaths(nodes: ChangeTreeNode[]): string[] {
  const paths: string[] = []
  const visit = (entries: ChangeTreeNode[]) => {
    for (const entry of entries) {
      if (!entry.directory) continue
      paths.push(entry.path)
      visit(entry.children)
    }
  }
  visit(nodes)
  return paths
}

function versionedEidosRoot(repositoryPath: string): string | null {
  const candidate = repositoryPath.toLowerCase()
  const root = VERSIONED_EIDOS_ROOTS.find(
    (versionedRoot) =>
      candidate === versionedRoot || candidate.startsWith(`${versionedRoot}/`)
  )
  if (!root) return null
  return repositoryPath.split("/").slice(0, root.split("/").length).join("/")
}

function isVersionActionPath(repositoryPath: string): boolean {
  const candidate = repositoryPath.toLowerCase()
  if (
    candidate === ".graft" ||
    candidate.startsWith(".graft/") ||
    candidate === ".eidos"
  ) {
    return false
  }
  if (candidate.startsWith(".eidos/")) {
    return versionedEidosRoot(repositoryPath) !== null
  }
  return true
}

export function collectVersionActionPathspecs(
  changes: Array<Pick<SpaceVersionChange, "path">>,
  requestedPath?: string
): string[] {
  const matchingPaths = changes
    .map((change) => change.path)
    .filter(
      (changePath) =>
        !requestedPath ||
        changePath === requestedPath ||
        changePath.startsWith(`${requestedPath}/`)
    )

  if (
    requestedPath &&
    isVersionActionPath(requestedPath) &&
    matchingPaths.some(isVersionActionPath)
  ) {
    return [requestedPath]
  }

  return Array.from(
    new Set(
      matchingPaths.flatMap((changePath) => {
        const productRoot = versionedEidosRoot(changePath)
        if (productRoot) return [productRoot]
        if (!isVersionActionPath(changePath)) return []
        const topLevelPath = changePath.split("/", 1)[0]
        return topLevelPath ? [topLevelPath] : []
      })
    )
  ).sort((left, right) => left.localeCompare(right))
}

export function shortCommitId(id: string, length = 7) {
  return id.length > length ? id.slice(0, length) : id
}

export function formatVersionTime(timestamp: number | null): string {
  if (timestamp === null) return "Time unavailable"
  const elapsed = Date.now() - timestamp
  const future = elapsed < 0
  const absoluteElapsed = Math.abs(elapsed)
  const minute = 60_000
  const hour = minute * 60
  const day = hour * 24
  const week = day * 7
  const month = day * 30
  const year = day * 365
  let value: number
  let unit: string
  if (absoluteElapsed < minute) return future ? "in a moment" : "just now"
  if (absoluteElapsed < hour) {
    value = Math.round(absoluteElapsed / minute)
    unit = "minute"
  } else if (absoluteElapsed < day) {
    value = Math.round(absoluteElapsed / hour)
    unit = "hour"
  } else if (absoluteElapsed < week) {
    value = Math.round(absoluteElapsed / day)
    unit = "day"
  } else if (absoluteElapsed < month) {
    value = Math.round(absoluteElapsed / week)
    unit = "week"
  } else if (absoluteElapsed < year) {
    value = Math.round(absoluteElapsed / month)
    unit = "month"
  } else {
    value = Math.round(absoluteElapsed / year)
    unit = "year"
  }
  const phrase = `${value} ${unit}${value === 1 ? "" : "s"}`
  return future ? `in ${phrase}` : `${phrase} ago`
}

export function formatAbsoluteVersionTime(timestamp: number | null): string {
  if (timestamp === null) return "Time unavailable"
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp)
}
