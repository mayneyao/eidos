import type { ReactNode } from "react"
import {
  assertEidosFileCalendarZone,
  supportsEidosFileCalendarProfile,
  type EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { EidosFileUIProvider, useEidosFileUI } from "./context"
import { eidosFileResolvedTimeZone } from "./eidos-file-date-time"

export type EidosFileCalendarViewContext =
  | { status: "legacy" }
  | { status: "supported"; timeZoneData: string }
  | { status: "unsupported" }

/** Examine every leaf, including NOT/OR and unsupported raw saved documents. */
export function eidosFileCalendarViewContext(
  view?: Pick<EidosFileViewInfo, "filter" | "query">,
  supported?: readonly string[]
): EidosFileCalendarViewContext {
  const values: unknown[] = [view?.filter]
  if (view?.query) {
    try {
      values.push(JSON.parse(view.query))
    } catch {
      /* legacy presentation strings are not calendar AST */
    }
  }
  const profiles = new Set<string>()
  let malformed = false
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return
    const node = value as Record<string, unknown>
    const calendar =
      node.op === "calendar-day"
        ? node
        : node.operator === "is-on-calendar-day" ||
            node.op === "is-on-calendar-day"
          ? (node.value as Record<string, unknown>)
          : undefined
    if (calendar) {
      if (typeof calendar.timeZoneData === "string")
        profiles.add(calendar.timeZoneData)
      else malformed = true
    }
    if ("filter" in node) visit(node.filter)
    if (node.op === "not") visit(node.arg)
    if (Array.isArray(node.args)) node.args.forEach(visit)
    if (Array.isArray(node.children)) node.children.forEach(visit)
  }
  values.forEach(visit)
  if (!profiles.size && !malformed) return { status: "legacy" }
  const profile = [...profiles][0]
  return !malformed &&
    profiles.size === 1 &&
    profile &&
    supportsEidosFileCalendarProfile(profile) &&
    (!supported || supported.includes(profile))
    ? { status: "supported", timeZoneData: profile }
    : { status: "unsupported" }
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
  const capabilities = supported ?? host.calendarDayTimeZoneData ?? []
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
      calendarDayTimeZoneData={capabilities}
      calendarTimeZoneData={
        state.status === "supported" && available ? state.timeZoneData : null
      }
    >
      {available
        ? children
        : (unsupported ?? (
            <div role="status" className="p-4 text-sm text-muted-foreground">
              {host.translate(
                "This view uses calendar rules this editor cannot display. Edit its calendar conditions to use one supported profile."
              )}
            </div>
          ))}
    </EidosFileUIProvider>
  )
}
