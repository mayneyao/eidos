export interface TimeZoneOption {
  readonly value: string
  readonly city: string
  readonly offset: string
  readonly searchText: string
}

export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
}

export function supportedTimeZones(): string[] {
  const supportedValuesOf = (
    Intl as unknown as {
      supportedValuesOf?: (key: string) => string[]
    }
  ).supportedValuesOf
  const zones = supportedValuesOf?.("timeZone") ?? []
  return [...new Set(["UTC", ...zones])].sort((left, right) =>
    left.localeCompare(right)
  )
}

export function timeZoneCity(timeZone: string): string {
  if (timeZone === "UTC") return "UTC"
  return (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ")
}

export function timeZoneOffset(
  timeZone: string,
  date: Date = new Date()
): string {
  return (
    new Intl.DateTimeFormat("en", {
      timeZone,
      timeZoneName: "longOffset",
    })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT"
  )
}

export function timeZoneOption(
  timeZone: string,
  date: Date = new Date()
): TimeZoneOption {
  const city = timeZoneCity(timeZone)
  const offset = timeZoneOffset(timeZone, date)
  return {
    value: timeZone,
    city,
    offset,
    searchText: `${city} ${timeZone} ${offset}`.toLocaleLowerCase(),
  }
}

export function filterTimeZoneOptions(
  options: readonly TimeZoneOption[],
  query: string
): TimeZoneOption[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return [...options]
  return options.filter((option) =>
    terms.every((term) => option.searchText.includes(term))
  )
}
