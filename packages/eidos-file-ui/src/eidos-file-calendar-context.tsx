import { useMemo, type ReactNode } from "react"
import {
  assertEidosFileCalendarZone,
  hasEidosFileCalendarPeriodQuery,
  supportsEidosFileCalendarProfile,
  EIDOS_FILE_CALENDAR_TIME_ZONE_DATA,
  type EidosFileCalendarContext,
  type EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { EidosFileUIProvider, useEidosFileUI } from "./context"
import { eidosFileResolvedTimeZone } from "./eidos-file-date-time"

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
  return hasEidosFileCalendarPeriodQuery(query) ||
    hasEidosFileCalendarPeriodQuery(view?.filter)
    ? { status: "unsupported" }
    : { status: "legacy" }
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
        ? {
            timeZone: eidosFileResolvedTimeZone(timeZone),
            timeZoneData: profile,
            weekStartsOn: weekStartsOnMonday === false ? 0 : 1,
          }
        : undefined,
    [profile, timeZone, weekStartsOnMonday]
  )
}

export function EidosFileCalendarViewProvider({
  view,
  supported,
  children,
  unsupported,
}: {
  view?: EidosFileViewInfo
  supported?: readonly string[]
  children: ReactNode
  unsupported?: ReactNode
}) {
  const host = useEidosFileUI()
  const capabilities = supported ?? host.calendarPeriodTimeZoneData ?? []
  const state = eidosFileCalendarViewContext(view, capabilities)
  let available = state.status !== "unsupported"
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
      timeZone={eidosFileResolvedTimeZone(host.timeZone)}
      queryEditingDisabled={
        view?.queryStatus === "unsupported" || host.queryEditingDisabled
      }
      calendarPeriodTimeZoneData={capabilities}
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
