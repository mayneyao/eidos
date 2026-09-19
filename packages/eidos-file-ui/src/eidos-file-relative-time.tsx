import { useEffect, useState } from "react"
import { useEidosFileUI } from "./context"

export function EidosFileRelativeTime({
  value,
  title,
}: {
  value: string
  title: string
}) {
  const { locale } = useEidosFileUI()
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  const seconds = (new Date(value).getTime() - now) / 1000
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1],
  ]
  const [unit, size] =
    units.find(([, size]) => Math.abs(seconds) >= size) ??
    units[units.length - 1]!
  const text = Number.isFinite(seconds)
    ? new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
        Math.round(seconds / size),
        unit
      )
    : title
  return (
    <time
      dateTime={value}
      title={title}
      className="shrink-0 text-xs tabular-nums text-muted-foreground"
    >
      {text}
    </time>
  )
}
