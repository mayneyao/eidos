import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  assertEidosFileCalendarZone,
  eidosFileCalendarPeriodBounds,
  hasEidosFileCalendarQuery,
  hasEidosFileCalendarWindowQuery,
  supportsEidosFileCalendarProfile,
  EIDOS_FILE_CALENDAR_TIME_ZONE_DATA,
  type EidosFileCalendarContext,
  type EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { EidosFileUIProvider, useEidosFileUI } from "./context"
import { eidosFileResolvedTimeZone } from "./eidos-file-date-time"
import type { RecordFieldManagement } from "./eidos-file-record-field-context"

export type EidosFileCalendarViewContext =
  | { status: "legacy" }
  | { status: "supported"; timeZoneData: string }
  | { status: "unsupported" }

/** Saved conditions never select presentation rules or freeze preferences. */
export function eidosFileCalendarViewContext(
  view?: Pick<EidosFileViewInfo, "filter" | "query">,
  supported?: readonly string[]
): EidosFileCalendarViewContext {
  const profile = EIDOS_FILE_CALENDAR_TIME_ZONE_DATA
  if (supported?.includes(profile) && supportsEidosFileCalendarProfile(profile))
    return { status: "supported", timeZoneData: profile }
  let query: unknown
  try {
    query = view?.query ? JSON.parse(view.query) : undefined
  } catch {
    /* preserved unsupported document */
  }
  return hasEidosFileCalendarQuery(query) ||
    hasEidosFileCalendarQuery(view?.filter)
    ? { status: "unsupported" }
    : { status: "legacy" }
}

/** Resolves transient query settings from the negotiated profile and host preferences. */
export function eidosFileCalendarExecution(
  timeZoneData: string,
  timeZone?: string,
  weekStartsOnMonday?: boolean
): EidosFileCalendarContext {
  return {
    timeZone: eidosFileResolvedTimeZone(timeZone),
    timeZoneData,
    weekStartsOn: weekStartsOnMonday === false ? 0 : 1,
  }
}

/** Host-resolved execution preferences shared by every renderer and input. */
export function useEidosFileCalendarExecution():
  | EidosFileCalendarContext
  | undefined {
  const {
    timeZone,
    calendarTimeZoneData,
    calendarPeriodTimeZoneData,
    weekStartsOnMonday,
  } = useEidosFileUI()
  const profile =
    calendarTimeZoneData ??
    (calendarPeriodTimeZoneData?.includes(EIDOS_FILE_CALENDAR_TIME_ZONE_DATA)
      ? EIDOS_FILE_CALENDAR_TIME_ZONE_DATA
      : undefined)
  return useMemo(
    () =>
      profile
        ? eidosFileCalendarExecution(profile, timeZone, weekStartsOnMonday)
        : undefined,
    [profile, timeZone, weekStartsOnMonday]
  )
}

/** Refresh active Formula views after a local date change or a suspended tab. */
export function useEidosFileFormulaDay(
  calendar: EidosFileCalendarContext | undefined,
  enabled: boolean
): number {
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!enabled || !calendar) return
    let date: string | undefined
    let timer: number | undefined
    const check = () => {
      window.clearTimeout(timer)
      if (document.visibilityState === "hidden") return
      const now = Date.now()
      let delay = 60_000
      try {
        const bounds = eidosFileCalendarPeriodBounds(
          { unit: "day", offset: 0 },
          calendar,
          new Date(now).toISOString()
        )
        if (date !== undefined && date !== bounds.startDate)
          setRevision((value) => value + 1)
        date = bounds.startDate
        const current = bounds.intervals.find(
          ([start, end]) => Date.parse(start) <= now && Date.parse(end) > now
        )
        if (current) delay = Math.min(delay, Date.parse(current[1]) - now)
      } catch {
        // The Runtime reports unsupported time zones and profile dates.
      }
      timer = window.setTimeout(check, delay)
    }
    check()
    window.addEventListener("focus", check)
    document.addEventListener("visibilitychange", check)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("focus", check)
      document.removeEventListener("visibilitychange", check)
    }
  }, [calendar, enabled])
  return revision
}

export function EidosFileCalendarViewProvider({
  view,
  supported,
  children,
  unsupported,
  calendarWindowVersion,
  recordFieldManagement,
}: {
  view?: EidosFileViewInfo
  supported?: readonly string[]
  children: ReactNode
  unsupported?: ReactNode
  calendarWindowVersion?: 1
  recordFieldManagement?: RecordFieldManagement
}) {
  const host = useEidosFileUI()
  const capabilities = supported ?? host.calendarPeriodTimeZoneData ?? []
  const windows = calendarWindowVersion ?? host.calendarWindowVersion
  const state = eidosFileCalendarViewContext(view, capabilities)
  let available = state.status !== "unsupported"
  let query: unknown
  try {
    query = view?.query ? JSON.parse(view.query) : undefined
  } catch {
    /* opaque document */
  }
  if (
    windows !== 1 &&
    (hasEidosFileCalendarWindowQuery(view?.filter) ||
      hasEidosFileCalendarWindowQuery(query))
  )
    available = false
  if (state.status === "supported") {
    try {
      assertEidosFileCalendarZone(
        eidosFileResolvedTimeZone(host.timeZone),
        state.timeZoneData
      )
    } catch {
      available = false
    }
  }
  return (
    <EidosFileUIProvider
      recordFieldManagement={recordFieldManagement}
      timeZone={eidosFileResolvedTimeZone(host.timeZone)}
      queryEditingDisabled={
        view?.queryStatus === "unsupported" || host.queryEditingDisabled
      }
      calendarPeriodTimeZoneData={capabilities}
      calendarWindowVersion={windows}
      calendarTimeZoneData={
        state.status === "supported" && available ? state.timeZoneData : null
      }
    >
      {available
        ? children
        : (unsupported ?? (
            <div role="status" className="p-4 text-sm text-muted-foreground">
              {host.translate(
                "This editor cannot use the application's calendar settings. Open this view in an updated editor."
              )}
            </div>
          ))}
    </EidosFileUIProvider>
  )
}
