// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { SpaceVersionCommit } from "../shared/contracts"
import {
  SyncInspector,
  pendingVersionPreview,
  syncInspectorAction,
  type SyncInspectorState,
} from "./sync-inspector"

const base: SyncInspectorState = {
  dirty: false,
  busy: false,
  progress: null,
  failure: null,
  readOnly: false,
  storageBlocked: false,
  checking: false,
}
describe("Sync inspector B", () => {
  it("opens the account menu from the identity and dismisses it with Escape", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {},
    })
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const onAccount = vi.fn()
    await act(async () =>
      root.render(
        <SyncInspector
          state={base}
          spaceKey="account-menu"
          account={({ buttonRef, expanded, onToggle }) => (
            <button ref={buttonRef} aria-expanded={expanded} onClick={onToggle}>
              test@example.com
            </button>
          )}
          onClose={() => undefined}
          onAction={() => undefined}
          onRetry={() => undefined}
          onAccount={onAccount}
        />
      )
    )
    const trigger = host.querySelector("header button") as HTMLButtonElement
    await act(async () => trigger.click())
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(onAccount).not.toHaveBeenCalled()
    expect(
      host.querySelector(".sync-inspector-settings")?.textContent
    ).toContain("Open logs")
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    )
    expect(host.querySelector(".sync-inspector-settings")).toBeNull()
    expect(document.activeElement).toBe(trigger)
    await act(async () => trigger.click())
    await act(async () =>
      (
        host.querySelector(
          ".sync-inspector-settings button"
        ) as HTMLButtonElement
      ).click()
    )
    expect(onAccount).toHaveBeenCalledOnce()
    expect(host.querySelector(".sync-inspector-settings")).toBeNull()
    await act(async () => root.unmount())
    host.remove()
  })
  it.each([
    [0, 0, false, "fetch"],
    [2, 0, false, "push"],
    [2, 0, true, "push"],
    [0, 3, false, "pull"],
    [2, 3, false, "merge"],
    [2, 3, true, "review"],
  ] as const)(
    "chooses one action for %s ahead / %s behind / dirty %s",
    (ahead, behind, dirty, expected) => {
      expect(
        syncInspectorAction({
          ...base,
          dirty,
          history: { state: "unknown", ahead, behind },
        })
      ).toBe(expected)
    }
  )
  it("does not offer upload with read-only access or insufficient storage", () => {
    const state = {
      ...base,
      history: { state: "ahead" as const, ahead: 2, behind: 0 },
    }
    expect(syncInspectorAction({ ...state, readOnly: true })).toBe("fetch")
    expect(syncInspectorAction({ ...state, storageBlocked: true })).toBe(
      "account"
    )
  })
  const commit = (id: string, parent: string | null): SpaceVersionCommit => ({
    id,
    parent,
    message: `Version ${id}`,
    timestampMs: 1000,
    files: 0,
    changes: [],
    tables: [],
    changedTables: 0,
  })
  it("only previews known pending ancestry and stops at shared history", () => {
    const commits = [
      commit("a", "b"),
      commit("b", "shared"),
      commit("shared", null),
      commit("remote", "missing"),
    ]
    expect(
      pendingVersionPreview(commits, "a", "shared", 2).map((c) => c.id)
    ).toEqual(["a", "b"])
    expect(
      pendingVersionPreview(commits, "remote", "shared", 3).map((c) => c.id)
    ).toEqual(["remote"])
    expect(pendingVersionPreview(commits, "unknown", "shared", 3)).toEqual([])
  })
  it("makes read-only access prominent and routes to account management", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement("div")
    const root = createRoot(host)
    const onAccount = vi.fn()
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getVersionHistory: vi.fn().mockResolvedValue({
          commits: [commit("a", "shared")],
        }),
      },
    })
    await act(async () =>
      root.render(
        <SyncInspector
          state={{
            ...base,
            readOnly: true,
            history: {
              state: "ahead",
              ahead: 2,
              behind: 0,
              localHead: "a",
              commonAncestor: "shared",
              checkedAtMs: 1000,
            },
          }}
          spaceKey="read-only"
          onClose={() => undefined}
          onAction={() => undefined}
          onRetry={() => undefined}
          onAccount={onAccount}
        />
      )
    )
    expect(host.querySelector("h2")?.textContent).toBe("Sync writes are paused")
    expect(host.querySelector("[data-sync-readonly]")?.textContent).toContain(
      "read-only or expired"
    )
    const primary = host.querySelector<HTMLButtonElement>(
      "[data-sync-next='account']"
    )
    expect(primary?.textContent).toContain("Manage Sync access")
    await act(async () => primary!.click())
    expect(onAccount).toHaveBeenCalledOnce()
    await act(async () => root.unmount())
  })
  it("renders a single upload action, real versions and local edits separately", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement("div")
    const root = createRoot(host)
    const onAction = vi.fn()
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getVersionHistory: vi
          .fn()
          .mockResolvedValue({ commits: [commit("a", "shared")] }),
      },
    })
    await act(async () =>
      root.render(
        <SyncInspector
          state={{
            ...base,
            dirty: true,
            history: {
              state: "ahead",
              ahead: 1,
              behind: 0,
              localHead: "a",
              commonAncestor: "shared",
              checkedAtMs: 1000,
            },
          }}
          spaceKey="test"
          onClose={() => undefined}
          onAction={onAction}
          onRetry={() => undefined}
          onAccount={() => undefined}
        />
      )
    )
    expect(host.querySelectorAll(".primary-action")).toHaveLength(1)
    expect(host.textContent).toContain("Version a")
    expect(host.textContent).toContain("Local changes have not been saved")
    await act(async () =>
      host.querySelector<HTMLButtonElement>("[data-sync-next='push']")!.click()
    )
    expect(onAction).toHaveBeenCalledWith("push")
    await act(async () => root.unmount())
  })
  it("keeps both counts and version previews visible before merging", async () => {
    const host = document.createElement("div")
    const root = createRoot(host)
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getVersionHistory: vi.fn().mockResolvedValue({
          commits: [commit("local", "shared"), commit("remote", "shared")],
        }),
        getSyncMergeStatus: vi
          .fn()
          .mockResolvedValue({ ok: true, value: { state: "none" } }),
      },
    })
    await act(async () =>
      root.render(
        <SyncInspector
          state={{
            ...base,
            history: {
              state: "diverged",
              ahead: 2,
              behind: 3,
              localHead: "local",
              remoteHead: "remote",
              commonAncestor: "shared",
            },
          }}
          spaceKey="diverged"
          onClose={() => undefined}
          onAction={() => undefined}
          onRetry={() => undefined}
          onAccount={() => undefined}
        />
      )
    )
    expect(
      host.querySelector("[data-sync-version-counts]")?.textContent
    ).toContain("Local to upload: 2")
    expect(
      host.querySelector("[data-sync-version-counts]")?.textContent
    ).toContain("Remote to receive: 3")
    expect(host.textContent).toContain("Version local")
    expect(host.textContent).toContain("Version remote")
    expect(host.querySelector("[data-sync-merge-start]")).not.toBeNull()
    await act(async () => root.unmount())
  })
  it("does not label stale history as synced while offline", async () => {
    const host = document.createElement("div")
    const root = createRoot(host)
    await act(async () =>
      root.render(
        <SyncInspector
          state={{
            ...base,
            history: {
              state: "up_to_date",
              ahead: 0,
              behind: 0,
              checkedAtMs: 1000,
            },
            failure: {
              code: "offline",
              state: "offline",
              title: "Offline",
              message: "Local files remain available",
              action: "retry-now",
              actionLabel: "Retry",
              retryable: true,
              localSafe: true,
            },
          }}
          spaceKey="offline"
          onClose={() => undefined}
          onAction={() => undefined}
          onRetry={() => undefined}
          onAccount={() => undefined}
        />
      )
    )
    expect(host.querySelector("h2")?.textContent).toBe("Offline")
    expect(host.textContent).not.toContain("Versions are up to date")
    expect(host.textContent).toContain("Results from the last successful check")
    await act(async () => root.unmount())
  })
})
