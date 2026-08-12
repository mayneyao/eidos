// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"

import type { EidosSyncMergeConflict } from "../shared/contracts"
import { MergeTableDiff } from "./merge-table-diff"

function rowConflict(
  id: string,
  table: string,
  name: string
): EidosSyncMergeConflict {
  return {
    id,
    path: "portfolio.eidos",
    pathKind: "sqlite_database",
    storage: "sqlite_snapshot",
    kind: "row",
    reason: "row_conflict",
    status: "unresolved",
    table,
    columns: ["_id", "Name", "Status", "Owner"],
    key: { _id: id },
    baseRow: [id, name, "Planning", "Ada"],
    oursRow: [id, name, "Blocked", "Local Team"],
    theirsRow: [id, name, "Ready", "Hosted Team"],
    oursOperation: "update",
    theirsOperation: "update",
  }
}

describe("MergeTableDiff", () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it("groups conflicts by table and compares fields instead of serialized rows", async () => {
    const onResolveRow = vi.fn()
    const onResolveTable = vi.fn()
    const project = rowConflict("project-1", "Projects", "Atlas")
    const risk = rowConflict("risk-1", "Risks", "Data loss")

    await act(async () =>
      root.render(
        createElement(MergeTableDiff, {
          conflicts: [project, risk],
          showBase: true,
          disabled: false,
          identityKey: "portfolio.eidos",
          onResolveRow,
          onResolveTable,
        })
      )
    )

    expect(host.querySelectorAll("[data-merge-table]")).toHaveLength(2)
    expect(host.textContent).toContain("2 unresolved · 0 resolved · 2 tables")
    expect(host.querySelector("pre")).toBeNull()
    expect(
      host.querySelectorAll("[data-merge-row-version='base']")
    ).toHaveLength(2)

    const projects = host.querySelector("[data-merge-table='Projects']")
    expect(projects?.querySelector("thead")?.textContent).toContain("Status")
    expect(projects?.querySelector("thead")?.textContent).toContain("Owner")
    expect(projects?.querySelector("thead")?.textContent).not.toContain("_id")
    expect(projects?.textContent).toContain("Atlas")
    expect(projects?.textContent).toContain("Planning")
    expect(projects?.textContent).toContain("Blocked")
    expect(projects?.textContent).toContain("Ready")

    const localButton = host.querySelector<HTMLButtonElement>(
      "button[aria-label='Use Local row for Atlas']"
    )
    await act(async () => localButton?.click())
    expect(onResolveRow).toHaveBeenCalledWith(project, "ours")

    const localTableButton = [
      ...(projects?.querySelectorAll("button") ?? []),
    ].find((item) => item.textContent?.includes("Use Local Table"))
    await act(async () => localTableButton?.click())
    expect(onResolveTable).toHaveBeenCalledWith("Projects", "ours")
  })

  it("keeps multiple conflicting records in one compact table group", async () => {
    const onResolveRow = vi.fn()
    const atlas = rowConflict("project-1", "Projects", "Atlas")
    const beacon = rowConflict("project-2", "Projects", "Beacon")
    const comet = rowConflict("project-3", "Projects", "Comet")

    await act(async () =>
      root.render(
        createElement(MergeTableDiff, {
          conflicts: [atlas, beacon, comet],
          showBase: true,
          disabled: false,
          identityKey: "portfolio.eidos:Projects",
          onResolveRow,
          onResolveTable: vi.fn(),
        })
      )
    )

    const projects = host.querySelector("[data-merge-table='Projects']")
    expect(host.querySelectorAll("[data-merge-table]")).toHaveLength(1)
    expect(host.textContent).toContain("3 unresolved · 0 resolved · 1 table")
    expect(projects?.querySelectorAll("tbody")).toHaveLength(3)
    expect(
      projects?.querySelectorAll(".merge-table-version-control")
    ).toHaveLength(9)

    const useHostedBeacon = host.querySelector<HTMLButtonElement>(
      "button[aria-label='Use Hosted row for Beacon']"
    )
    await act(async () => useHostedBeacon?.click())
    expect(onResolveRow).toHaveBeenCalledWith(beacon, "theirs")
  })

  it("shows an immediate pending choice and the durable resolved side", async () => {
    const conflict = rowConflict("project-1", "Projects", "Atlas")
    const render = async (
      item: EidosSyncMergeConflict,
      pendingResolution: {
        conflictId: string
        result: "ours" | "theirs"
      } | null
    ) =>
      act(async () =>
        root.render(
          createElement(MergeTableDiff, {
            conflicts: [item],
            showBase: false,
            disabled: pendingResolution !== null,
            identityKey: "portfolio.eidos:Projects",
            pendingResolution,
            onResolveRow: vi.fn(),
            onResolveTable: vi.fn(),
          })
        )
      )

    await render(conflict, {
      conflictId: conflict.id,
      result: "theirs",
    })
    const pending = host.querySelector<HTMLButtonElement>(
      "button[aria-label='Use Hosted row for Atlas']"
    )
    expect(pending?.getAttribute("aria-busy")).toBe("true")
    expect(pending?.textContent).toContain("Saving Hosted")

    await render(
      { ...conflict, status: "resolved", resolution: "theirs" },
      null
    )
    const resolved = host.querySelector<HTMLButtonElement>(
      "button[aria-label='Use Hosted row for Atlas']"
    )
    const local = host.querySelector<HTMLButtonElement>(
      "button[aria-label='Use Local row for Atlas']"
    )
    expect(
      host
        .querySelector("[data-merge-table='Projects']")
        ?.getAttribute("data-merge-table-status")
    ).toBe("resolved")
    expect(host.textContent).toContain("0 unresolved · 1 resolved · 1 table")
    expect(host.textContent).toContain("Resolved with Hosted")
    expect(resolved?.textContent).toContain("Using Hosted")
    expect(resolved?.disabled).toBe(true)
    expect(resolved?.getAttribute("aria-pressed")).toBe("true")
    expect(local?.disabled).toBe(false)
  })

  it("keeps the user-table label visible and reveals system context through All fields", async () => {
    const conflict = rowConflict("project-1", "Projects", "Atlas")
    await act(async () =>
      root.render(
        createElement(MergeTableDiff, {
          conflicts: [conflict],
          showBase: false,
          disabled: false,
          identityKey: "portfolio.eidos",
          onResolveRow: vi.fn(),
          onResolveTable: vi.fn(),
        })
      )
    )

    const header = () =>
      host.querySelector("[data-merge-table='Projects'] thead")?.textContent
    expect(header()).not.toContain("_id")
    expect(header()).toContain("Name")

    const allFields = [...host.querySelectorAll("button")].find(
      (item) => item.textContent === "All fields"
    )
    await act(async () => allFields?.click())

    expect(header()).toContain("_id")
    expect(header()).toContain("Name")
    expect(host.querySelector("[data-merge-row-version='base']")).toBeNull()
  })

  it("resolves individual conflicting fields and shows their durable choice", async () => {
    const onResolveCell = vi.fn()
    const conflict: EidosSyncMergeConflict = {
      ...rowConflict("incident-1", "Incidents", "Database outage"),
      columns: ["Status"],
      rowColumns: ["_id", "Title", "Status", "Owner"],
      cells: [
        {
          column: "Status",
          base: "Planning",
          local: "Investigating",
          hosted: "Monitoring",
        },
      ],
    }
    const render = async (item: EidosSyncMergeConflict) =>
      act(async () =>
        root.render(
          createElement(MergeTableDiff, {
            conflicts: [item],
            showBase: true,
            disabled: false,
            identityKey: "operations.eidos:Incidents",
            onResolveRow: vi.fn(),
            onResolveCell,
            onResolveTable: vi.fn(),
          })
        )
      )

    await render(conflict)
    const local = host.querySelector<HTMLButtonElement>(
      "button[aria-label='Use Local value for Status in Database outage']"
    )
    await act(async () => local?.click())
    expect(onResolveCell).toHaveBeenCalledWith(conflict, "Status", "ours")

    await render({
      ...conflict,
      resolution: "cells",
      cells: conflict.cells?.map((cell) => ({
        ...cell,
        resolution: "ours" as const,
      })),
    })
    const selected = host.querySelector<HTMLButtonElement>(
      "button[aria-label='Use Local value for Status in Database outage']"
    )
    expect(selected?.getAttribute("aria-pressed")).toBe("true")
    expect(selected?.textContent).toContain("Using Local")
    expect(selected?.closest("td")?.getAttribute("data-cell-resolution")).toBe(
      "ours"
    )
  })
})
