/** Returns the globally smallest normalized simple directed cycle. */
export function smallestDependencyCycle(
  graph: Map<string, Set<string>>
): string[] | undefined {
  const compare = (left: string, right: string) =>
    left < right ? -1 : left > right ? 1 : 0
  const nodes = Array.from(graph.keys()).sort(compare)
  for (const start of nodes) {
    const visited = new Set([start])
    const search = (current: string, path: string[]): string[] | undefined => {
      const neighbors = Array.from(graph.get(current) ?? []).sort(compare)
      for (const next of neighbors) {
        if (compare(next, start) < 0) continue
        if (next === start) return [...path, start]
        if (visited.has(next)) continue
        visited.add(next)
        const found = search(next, [...path, next])
        visited.delete(next)
        if (found) return found
      }
      return undefined
    }
    const found = search(start, [start])
    if (found) return found
  }
  return undefined
}
