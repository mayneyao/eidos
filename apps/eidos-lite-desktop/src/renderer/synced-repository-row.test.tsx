// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { SyncedRepositoryRow } from "./synced-repository-row"

it("hides unsupported actions and keeps the existing download action", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement("div")
  const root = createRoot(host)
  const open = vi.fn()
  try {
    await act(async () =>
      root.render(
        <SyncedRepositoryRow
          repository={{
            name: "notes",
            displayName: "Notes",
            remoteUrl: "https://personal.test/personal/notes",
            createdAtMs: 1,
          }}
          disabled={false}
          onOpen={open}
        />
      )
    )
    expect(host.textContent).toContain("Copy remote address")
    expect(host.textContent).not.toContain("Delete remote Space")
    expect(host.textContent).not.toContain("Rename remote Space")
    await act(async () =>
      host.querySelector<HTMLButtonElement>(".open-synced-row")!.click()
    )
    expect(open).toHaveBeenCalledOnce()
  } finally {
    await act(async () => root.unmount())
  }
})

it("shows deleting until status confirms completion and never opens that repository", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  const manage = vi
    .fn()
    .mockResolvedValueOnce("deleting")
    .mockResolvedValue("deleted")
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: { manageSyncRepository: manage },
  })
  const host = document.createElement("div")
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <SyncedRepositoryRow
          serverId="custom-server"
          management={{ rename: true, delete: true }}
          repository={{
            name: "stable-id",
            displayName: "Notes",
            remoteUrl: "https://personal.test/personal/stable-id",
            createdAtMs: 1,
          }}
          disabled={false}
          onOpen={vi.fn()}
        />
      )
    )
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Delete remote Space")!
        .click()
    )
    expect(manage).toHaveBeenCalledWith({
      serverId: "custom-server",
      name: "stable-id",
      action: "delete",
    })
    expect(host.textContent).toContain("Deleting remote copy")
    expect(
      host.querySelector<HTMLButtonElement>(".open-synced-row")!.disabled
    ).toBe(true)
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    expect(host.textContent).toContain(
      "Remote Space deleted. Local files are kept."
    )
    expect(host.querySelector("details")).toBeNull()
  } finally {
    await act(async () => root.unmount())
    vi.useRealTimers()
  }
})
