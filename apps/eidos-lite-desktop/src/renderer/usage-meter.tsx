export function formatUsageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KiB", "MiB", "GiB", "TiB"] as const
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const decimals = unit === 0 || value >= 100 ? 0 : 1
  return `${value.toFixed(decimals)} ${units[unit]}`
}

export function usagePercent(used: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  return Math.min(100, Math.max(0, (used / total) * 100))
}

export interface UsageMeterSegment {
  key: string
  label: string
  value: number
  tone: "accent" | "warning" | "muted"
}

interface UsageMeterProps {
  title: string
  total: number
  segments: UsageMeterSegment[]
  usedLabel: string
  freeLabel: string
  formatValue?: (value: number) => string
}

export function UsageMeter({
  title,
  total,
  segments,
  usedLabel,
  freeLabel,
  formatValue = formatUsageBytes,
}: UsageMeterProps) {
  const used = segments.reduce(
    (sum, segment) => sum + Math.max(0, segment.value),
    0
  )
  const remaining = Math.max(0, total - used)
  const visible = segments.filter((segment) => segment.value > 0)
  return (
    <div className="usage-meter">
      <div className="usage-meter-head">
        <strong>{title}</strong>
        <span>{usedLabel}</span>
      </div>
      <div
        className="usage-meter-bar"
        role="img"
        aria-label={`${title}: ${usedLabel}`}
      >
        {visible.map((segment) => (
          <span
            key={segment.key}
            className={`usage-meter-segment is-${segment.tone}`}
            style={{ flexGrow: segment.value }}
          />
        ))}
        {remaining > 0 ? (
          <span
            className="usage-meter-segment is-free"
            style={{ flexGrow: remaining }}
          />
        ) : null}
      </div>
      <ul className="usage-meter-legend">
        {visible.map((segment) => (
          <li key={segment.key}>
            <i className={`is-${segment.tone}`} aria-hidden="true" />
            {segment.label}
            <span>{formatValue(segment.value)}</span>
          </li>
        ))}
        {remaining > 0 ? (
          <li>
            <i className="is-free" aria-hidden="true" />
            {freeLabel}
            <span>{formatValue(remaining)}</span>
          </li>
        ) : null}
      </ul>
    </div>
  )
}
