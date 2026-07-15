import { describe, expect, it } from "vitest"

import { parseMarkdownTasks } from "../examples/markdown-task-board/src/tasks"

describe("parseMarkdownTasks", () => {
  it("returns checkbox marker offsets in JavaScript UTF-16 code units", () => {
    const text = "# 🚀 Launch\n- [ ] Ship UI\n- [X] Write docs\n"

    expect(parseMarkdownTasks(text)).toEqual([
      {
        checked: false,
        label: "Ship UI",
        line: 2,
        markerOffset: text.indexOf("[ ]") + 1,
      },
      {
        checked: true,
        label: "Write docs",
        line: 3,
        markerOffset: text.indexOf("[X]") + 1,
      },
    ])
  })

  it("supports CRLF and ignores task-like text inside fenced code", () => {
    const text = [
      "* [ ] First",
      "```md",
      "- [ ] Example only",
      "```",
      "+ [x] Second",
    ].join("\r\n")

    const tasks = parseMarkdownTasks(text)
    expect(tasks.map((task) => task.label)).toEqual(["First", "Second"])
    expect(tasks[1].markerOffset).toBe(text.indexOf("[x]") + 1)
  })
})
