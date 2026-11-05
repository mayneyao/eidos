/** Binary units shared by Lite's file properties and Sync displays. */
export function formatBytes(value: number, locale?: string): string {
  if (!Number.isFinite(value) || value < 0) return "—"
  if (value === 0) return "0 bytes"
  const units = ["bytes", "KiB", "MiB", "GiB", "TiB"]
  const unit = Math.max(
    0,
    Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
  )
  const scaled = value / 1024 ** unit
  return `${scaled.toLocaleString(locale, {
    maximumFractionDigits: unit === 0 ? 0 : 1,
  })} ${units[unit]}`
}
