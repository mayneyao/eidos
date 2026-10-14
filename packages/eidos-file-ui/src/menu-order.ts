/** Ignore absent actions without losing their saved positions. */
export function orderMenuItems<T extends { id: string }>(
  items: T[],
  order: readonly string[]
): T[] {
  const byId = new Map(items.map((item) => [item.id, item]))
  const result: T[] = []
  for (const id of order) {
    const item = byId.get(id)
    if (item) {
      result.push(item)
      byId.delete(id)
    }
  }
  for (const item of items) {
    if (byId.delete(item.id)) result.push(item)
  }
  return result
}

/** Replace visible slots; preserve currently unavailable file/plugin actions. */
export function mergeMenuOrder(
  saved: readonly string[],
  visible: readonly string[]
): string[] {
  const visibleIds = new Set(visible)
  const complete = [...new Set([...saved, ...visible])]
  let index = 0
  return complete.map((id) => (visibleIds.has(id) ? visible[index++]! : id))
}
