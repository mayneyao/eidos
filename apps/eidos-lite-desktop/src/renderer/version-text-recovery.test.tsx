// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { VersionTextRecovery } from "./version-text-recovery"

vi.mock("./i18n", () => ({
  useEidosLiteI18n: () => ({ t: (text: string) => text }),
}))

it("restores deleted text through the supplied recovery action and reports backups", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement("div")
  const root = createRoot(host)
  const restore = vi.fn(async () => ["note.before-restore.md"])
  try {
    await act(async () =>
      root.render(
        <VersionTextRecovery
          content={{
            path: "note.md",
            before: { state: "utf8", content: "old", size: 3 },
            after: { state: "absent" },
          }}
          onRestore={restore}
        />
      )
    )
    const button = host.querySelector("button")!
    expect(button.textContent).toBe("Restore before deletion")
    await act(async () => button.click())
    expect(restore).toHaveBeenCalledOnce()
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "note.before-restore.md"
    )
  } finally {
    await act(async () => root.unmount())
  }
})

it("sends only the chosen readable version to the exclusive copy workflow", async () => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  const save = vi.fn(async () => true)
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: { saveTextDraftCopy: save },
  })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <VersionTextRecovery
          content={{
            path: "deleted.md",
            before: { state: "utf8", content: "# 旧笔记\n", size: 12 },
            after: { state: "absent" },
          }}
        />
      )
    )
    expect(host.querySelectorAll("button")).toHaveLength(1)
    await act(async () => host.querySelector("button")!.click())
    expect(save).toHaveBeenCalledWith("deleted.md", "# 旧笔记\n")
    expect(host.textContent).toContain("Current files and drafts are unchanged")
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
