import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  filterQuickOpenSections,
  useQuickOpenStore,
  type QuickOpenContextSection,
} from "./quick-open-store"

const tasksSection: QuickOpenContextSection = {
  id: "base-tables",
  heading: "Tables in tasks.base",
  inputHint: "tasks.base",
  priority: 100,
  items: [
    {
      id: "tasks",
      kind: "base-table",
      label: "Tasks",
      detail: "12 rows",
      keywords: ["projects/tasks.base", "tb_tasks"],
      current: true,
      onSelect: vi.fn(),
    },
    {
      id: "people",
      kind: "base-table",
      label: "People",
      detail: "4 rows",
      keywords: ["projects/tasks.base", "tb_people"],
      onSelect: vi.fn(),
    },
  ],
}

describe("quick-open context store", () => {
  beforeEach(() => {
    useQuickOpenStore.setState({ sectionsByTab: {} })
  })

  it("keeps contextual sections isolated by tab", () => {
    const { registerSection, unregisterSection } = useQuickOpenStore.getState()
    registerSection("tab-a", tasksSection)
    registerSection("tab-b", {
      ...tasksSection,
      heading: "Tables in contacts.base",
    })

    expect(
      useQuickOpenStore.getState().sectionsByTab["tab-a"]["base-tables"].heading
    ).toBe("Tables in tasks.base")
    expect(
      useQuickOpenStore.getState().sectionsByTab["tab-b"]["base-tables"].heading
    ).toBe("Tables in contacts.base")

    unregisterSection("tab-a", "base-tables")
    expect(useQuickOpenStore.getState().sectionsByTab["tab-a"]).toBeUndefined()
    expect(useQuickOpenStore.getState().sectionsByTab["tab-b"]).toBeDefined()
  })

  it("matches labels, details, and Base path keywords", () => {
    expect(
      filterQuickOpenSections([tasksSection], "people 4")[0].items
    ).toHaveLength(1)
    expect(
      filterQuickOpenSections([tasksSection], "tb_tasks")[0].items[0].id
    ).toBe("tasks")
    expect(filterQuickOpenSections([tasksSection], "missing")).toEqual([])
  })

  it("orders a copy without mutating the registered section order", () => {
    const sections = [
      { ...tasksSection, id: "files", priority: 10 },
      tasksSection,
    ]

    expect(filterQuickOpenSections(sections, "").map(({ id }) => id)).toEqual([
      "base-tables",
      "files",
    ])
    expect(sections.map(({ id }) => id)).toEqual(["files", "base-tables"])
  })
})
