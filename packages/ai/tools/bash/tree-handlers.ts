import type { DataSpace } from "@/packages/core/data-space"

export interface ExecResult {
  exitCode: number
  stdout: string
  stderr: string
}

interface FlatNode {
  id: string
  name: string
  type: string
  parent_id: string | null
}

interface TreeNode {
  id: string
  name: string
  type: string
  childCount: number
  children?: TreeNode[]
}

export async function listTree(
  ds: DataSpace,
  parentId?: string,
  depth?: number
): Promise<ExecResult> {
  try {
    const rows = (await ds.db.selectObjects(
      `SELECT id, name, type, parent_id
       FROM eidos__tree
       WHERE is_deleted = 0
       ORDER BY type, name`
    )) as FlatNode[]

    const childrenMap = new Map<string | null, FlatNode[]>()
    for (const row of rows) {
      const pid = row.parent_id ?? null
      if (!childrenMap.has(pid)) {
        childrenMap.set(pid, [])
      }
      childrenMap.get(pid)!.push(row)
    }

    const nodes = parentId ? childrenMap.get(parentId) : childrenMap.get(null)

    if (!nodes || nodes.length === 0) {
      return {
        exitCode: 0,
        stdout: JSON.stringify([], null, 2),
        stderr: parentId ? `No children found for node: ${parentId}` : "",
      }
    }

    const maxDepth = depth ?? 1
    const tree = nodes.map((n) => buildNode(n, childrenMap, 0, maxDepth))

    return {
      exitCode: 0,
      stdout: JSON.stringify(tree, null, 2),
      stderr: "",
    }
  } catch (err) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
    }
  }
}

function buildNode(
  node: FlatNode,
  childrenMap: Map<string | null, FlatNode[]>,
  currentDepth: number,
  maxDepth: number
): TreeNode {
  const childNodes = childrenMap.get(node.id) ?? []
  const childCount = childNodes.length

  const result: TreeNode = {
    id: node.id,
    name: node.name,
    type: node.type,
    childCount,
  }

  if (currentDepth < maxDepth && childCount > 0) {
    result.children = childNodes.map((c) =>
      buildNode(c, childrenMap, currentDepth + 1, maxDepth)
    )
  }

  return result
}
