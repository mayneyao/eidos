import { describe, expect, it } from "vitest"

import {
  parseServeNavigationParameters,
  resolveServeNavigation,
  resolveServeView,
} from "./navigation"

const TASKS = "0198c72d-82b5-7000-8000-000000000010"
const PEOPLE = "0198c72d-82b5-7000-8000-000000000020"
const TASKS_GRID = "0198c72d-82b5-7000-8000-000000000011"
const TASKS_BOARD = "0198c72d-82b5-7000-8000-000000000012"
const PEOPLE_GRID = "0198c72d-82b5-7000-8000-000000000021"

const snapshot = {
  metadata: { defaultTableId: TASKS },
  tables: [
    {
      table: { id: TASKS },
      views: [
        { id: TASKS_GRID, type: "grid" },
        { id: TASKS_BOARD, type: "kanban" },
      ],
    },
    {
      table: { id: PEOPLE },
      views: [{ id: PEOPLE_GRID, type: "grid" }],
    },
  ],
}

describe("Serve URL navigation", () => {
  it.each(["feed", "gallery", "kanban", "calendar"])(
    "defaults to the first saved %s view even when a grid exists",
    (type) => {
      const reordered = {
        ...snapshot,
        tables: [
          {
            ...snapshot.tables[0],
            views: [
              { id: TASKS_BOARD, type },
              { id: TASKS_GRID, type: "grid" },
            ],
          },
        ],
      }
      for (const search of [
        "",
        `?table=${TASKS}`,
        "?view=invalid",
        `?view=${PEOPLE_GRID}`,
      ]) {
        expect(resolveServeNavigation(reordered, search)).toEqual({
          tableId: TASKS,
          viewId: TASKS_BOARD,
        })
      }
      expect(resolveServeNavigation(reordered, `?view=${TASKS_GRID}`)).toEqual({
        tableId: TASKS,
        viewId: TASKS_GRID,
      })
    }
  )

  it("uses saved order for unvisited tables and deleted selections, preserving valid selections", () => {
    const views = [{ id: TASKS_BOARD }, { id: TASKS_GRID }]
    expect(resolveServeView(views)).toBe(views[0])
    expect(resolveServeView(views, PEOPLE_GRID)).toBe(views[0])
    expect(resolveServeView(views, TASKS_GRID)).toBe(views[1])
    expect(resolveServeView([], TASKS_GRID)).toBeUndefined()
  })

  it("handles empty tables and files", () => {
    expect(resolveServeNavigation({ ...snapshot, tables: [] }, "")).toEqual({
      tableId: null,
      viewId: null,
    })
    expect(
      resolveServeNavigation(
        { ...snapshot, tables: [{ ...snapshot.tables[0], views: [] }] },
        ""
      )
    ).toEqual({
      tableId: TASKS,
      viewId: null,
    })
  })

  it("selects an explicit table and one of its views", () => {
    expect(
      resolveServeNavigation(snapshot, `?table=${TASKS}&view=${TASKS_BOARD}`)
    ).toEqual({ tableId: TASKS, viewId: TASKS_BOARD })
  })

  it("finds the owning table when only a view is supplied", () => {
    expect(resolveServeNavigation(snapshot, `?view=${PEOPLE_GRID}`)).toEqual({
      tableId: PEOPLE,
      viewId: PEOPLE_GRID,
    })
  })

  it("falls back safely when parameters do not resolve", () => {
    expect(
      resolveServeNavigation(snapshot, "?table=invalid&view=invalid")
    ).toEqual({ tableId: TASKS, viewId: TASKS_GRID })
    expect(
      parseServeNavigationParameters(`?table=${TASKS}&table=${PEOPLE}`)
    ).toEqual({ tableId: null, viewId: null })
  })
})
