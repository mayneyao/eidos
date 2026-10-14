export type EidosLiteMenuOrders = { "grid.cell"?: string[] }

const MAX_ITEMS = 512
function validId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    !/[\u0000-\u001f]/.test(value)
  )
}

export function normalizeEidosLiteMenuOrders(
  value: unknown
): EidosLiteMenuOrders {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const order = (value as Record<string, unknown>)["grid.cell"]
  if (!Array.isArray(order)) return {}
  return {
    "grid.cell": [...new Set(order.filter(validId))].slice(0, MAX_ITEMS),
  }
}

export function isEidosLiteMenuOrders(
  value: unknown
): value is EidosLiteMenuOrders {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  if (Object.keys(candidate).some((key) => key !== "grid.cell")) return false
  if (!("grid.cell" in candidate)) return true
  const order = candidate["grid.cell"]
  return (
    Array.isArray(order) &&
    order.length <= MAX_ITEMS &&
    order.every(validId) &&
    new Set(order).size === order.length
  )
}
