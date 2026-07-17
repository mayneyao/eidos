import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  filterQuickOpenSections,
  useQuickOpenStore,
  type QuickOpenContextSection,
} from "./quick-open-store"

const tasksSection: QuickOpenContextSection = {
  id: "eidos-file-tables",
  heading: "Tables in tasks.eidos",
  inputHint: "tasks.eidos",
  priority: 100,
  items: [
    {
      id: "tasks",
      kind: "eidos-file-table",
      label: "Tasks",
      detail: "12 rows",
      keywords: ["projects/tasks.eidos", "tb_tasks"],
      current: true,
      onSelect: vi.fn(),
    },
    {
      id: "people",
      kind: "eidos-file-table",
      label: "People",
      detail: "4 rows",
      keywords: ["projects/tasks.eidos", "tb_people"],
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
      heading: "Tables in contacts.eidos",
    })

    expect(
      useQuickOpenStore.getState().sectionsByTab["tab-a"]["eidos-file-tables"]
        .heading
    ).toBe("Tables in tasks.eidos")
    expect(
      useQuickOpenStore.getState().sectionsByTab["tab-b"]["eidos-file-tables"]
        .heading
    ).toBe("Tables in contacts.eidos")

    unregisterSection("tab-a", "eidos-file-tables")
    expect(useQuickOpenStore.getState().sectionsByTab["tab-a"]).toBeUndefined()
    expect(useQuickOpenStore.getState().sectionsByTab["tab-b"]).toBeDefined()
  })

  it("matches labels, details, and Eidos File path keywords", () => {
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
      "eidos-file-tables",
      "files",
    ])
    expect(sections.map(({ id }) => id)).toEqual(["files", "eidos-file-tables"])
  })
})
