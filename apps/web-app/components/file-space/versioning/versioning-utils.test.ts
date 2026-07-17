// @vitest-environment node

import type { SpaceVersionChange } from "@/apps/web-app/hooks/use-space-versioning"

import { buildCommitGraphRows } from "./commit-graph"
import {
  buildChangeTree,
  collectVersionActionPathspecs,
} from "./versioning-utils"

function commit(id: string, parents: string[]) {
  return {
    id,
    parents,
    message: id,
    timestamp: null,
    changedPaths: [],
    labels: [],
  }
}

describe("file Space versioning presentation models", () => {
  it("builds a directory tree and promotes the strongest child status", () => {
    const changes: SpaceVersionChange[] = [
      { path: "notes/today.md", status: "modified" },
      { path: "notes/archive/old.md", status: "deleted" },
      { path: "assets/cover.png", status: "added" },
    ]

    const tree = buildChangeTree(changes)

    expect(tree.map((node) => node.name)).toEqual(["assets", "notes"])
    expect(tree[1]).toMatchObject({
      path: "notes",
      directory: true,
      status: "deleted",
    })
    expect(tree[1].children.map((node) => node.name)).toEqual([
      "archive",
      "today.md",
    ])
  })

  it("derives safe product pathspecs from status instead of targeting .eidos", () => {
    const changes: SpaceVersionChange[] = [
      {
        path: ".eidos/extensions/local.counter/src/extension.ts",
        status: "modified",
      },
      {
        path: ".eidos/agent/sessions/conversation-a/events.jsonl",
        status: "modified",
      },
      {
        path: ".eidos/agent/local/state.sqlite3",
        status: "modified",
      },
      { path: "notes/today.md", status: "modified" },
    ]

    expect(collectVersionActionPathspecs(changes, ".eidos")).toEqual([
      ".eidos/agent/sessions",
      ".eidos/extensions",
    ])
    expect(collectVersionActionPathspecs(changes, ".eidos/agent")).toEqual([
      ".eidos/agent/sessions",
    ])
    expect(collectVersionActionPathspecs(changes, ".eidos/extensions")).toEqual(
      [".eidos/extensions"]
    )
    expect(collectVersionActionPathspecs(changes)).toEqual([
      ".eidos/agent/sessions",
      ".eidos/extensions",
      "notes",
    ])
    expect(
      collectVersionActionPathspecs(changes, ".eidos/agent/local")
    ).toEqual([])
  })

  it("keeps merge parents in separate lanes until they converge", () => {
    const rows = buildCommitGraphRows([
      commit("merge", ["left", "right"]),
      commit("left", ["root"]),
      commit("right", ["root"]),
      commit("root", []),
    ])

    expect(rows.map((row) => row.lane)).toEqual([0, 0, 1, 0])
    expect(rows.map((row) => row.hasIncoming)).toEqual([
      false,
      true,
      true,
      true,
    ])
    expect(rows.every((row) => row.maxLane === 2)).toBe(true)
  })
})
