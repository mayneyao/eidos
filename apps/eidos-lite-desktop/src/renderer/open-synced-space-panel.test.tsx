// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { OpenSyncedSpacePanel } from "./open-synced-space-panel"
import type { EidosSyncProgress } from "../shared/contracts"

it("shows clone progress while opening a Space and clears it after failure", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let notify!: (event: EidosSyncProgress) => void
  let finish!: (result: unknown) => void
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: {
      listCustomSyncServers: vi.fn().mockResolvedValue([]),
      getSyncPasswordSettings: vi.fn().mockResolvedValue({ configured: true }),
      getSyncStatus: vi
        .fn()
        .mockResolvedValue({ account: { state: "signed-in" }, canClone: true }),
      listSyncRepositories: vi.fn().mockResolvedValue({
        repositories: [
          { displayName: "Notes", remoteUrl: "https://example.test/notes" },
        ],
      }),
      cloneSyncRepository: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve
          })
      ),
      onSyncProgress: vi.fn((listener) => {
        notify = listener
        return () => {}
      }),
      openSettingsDestination: vi.fn(),
    },
  })
  const host = document.createElement("div")
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(<OpenSyncedSpacePanel platform="darwin" onClose={() => {}} />)
    )
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Notes")!
        .click()
    )
    expect(host.querySelector('[role="progressbar"]')).not.toBeNull()
    expect(host.querySelector('[aria-label="Your synced Spaces"]')).toBeNull()
    await act(async () =>
      notify({
        runId: "clone",
        operation: "clone",
        state: "active",
        phase: "pull",
        detail: "Receiving",
        startedAtMs: 0,
        phaseStartedAtMs: 0,
        elapsedMs: 10,
        transfer: {
          direction: "download",
          transferredBytes: 512,
          totalBytes: 1024,
          bytesPerSecond: 0,
          estimatedRemainingMs: null,
        },
      })
    )
    expect(host.querySelector("progress")?.getAttribute("value")).toBe("512")
    await act(async () =>
      finish({ ok: false, failure: { message: "Connection failed" } })
    )
    expect(host.querySelector('[role="progressbar"]')).toBeNull()
    expect(host.textContent).toContain("Connection failed")
    expect(
      host.querySelector('[aria-label="Your synced Spaces"]')
    ).not.toBeNull()
  } finally {
    await act(async () => root.unmount())
  }
})

it("switches servers without showing a stale list and clones through the selected server", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let resolveOfficial!: (value: unknown) => void
  const official = new Promise((resolve) => {
    resolveOfficial = resolve
  })
  const cloneSyncRepository = vi
    .fn()
    .mockResolvedValue({ ok: true, snapshot: null })
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: {
      listCustomSyncServers: vi.fn().mockResolvedValue([
        {
          id: "home",
          name: "Home server",
          origin: "https://example.test",
          credentialAvailable: true,
        },
      ]),
      getSyncPasswordSettings: vi
        .fn()
        .mockResolvedValue({ configured: true, available: true }),
      getSyncStatus: vi
        .fn()
        .mockResolvedValue({ account: { state: "signed-in" }, canClone: true }),
      listSyncRepositories: vi.fn().mockReturnValue(official),
      listCustomSyncRepositories: vi.fn().mockResolvedValue({
        repositories: [
          {
            name: "notes",
            displayName: "Notes",
            remoteUrl: "https://example.test/personal/notes",
            createdAtMs: 1,
          },
        ],
      }),
      cloneSyncRepository,
      openSettingsDestination: vi.fn(),
    },
  })
  const host = document.createElement("div")
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(<OpenSyncedSpacePanel platform="darwin" onClose={() => {}} />)
    )
    const select = host.querySelector<HTMLSelectElement>("select")!
    await act(async () => {
      select.value = "home"
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })
    expect(host.textContent).toContain("Notes")
    await act(async () =>
      resolveOfficial({
        repositories: [
          {
            name: "old",
            displayName: "Old Space",
            remoteUrl: "https://official.test/old",
            createdAtMs: 1,
          },
        ],
      })
    )
    expect(host.textContent).not.toContain("Old Space")
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Notes")!
        .click()
    )
    expect(cloneSyncRepository).toHaveBeenCalledWith(
      "https://example.test/personal/notes",
      "Notes",
      undefined,
      { provider: "custom", serverId: "home" }
    )
  } finally {
    await act(async () => root.unmount())
  }
})

it("lets a signed-out user choose a custom server", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: {
      listCustomSyncServers: vi
        .fn()
        .mockResolvedValue([{ id: "home", name: "Home server" }]),
      getSyncPasswordSettings: vi.fn().mockResolvedValue({ configured: false }),
      getSyncStatus: vi.fn(async (selection) =>
        selection.provider === "official"
          ? { account: { state: "signed-out" }, canClone: false }
          : { account: { state: "signed-out" }, canClone: true }
      ),
      listCustomSyncRepositories: vi
        .fn()
        .mockResolvedValue({ repositories: [] }),
      openSettingsDestination: vi.fn(),
    },
  })
  const host = document.createElement("div")
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(<OpenSyncedSpacePanel platform="darwin" onClose={() => {}} />)
    )
    expect(host.textContent).toContain("Sign in")
    const select = host.querySelector<HTMLSelectElement>("select")!
    await act(async () => {
      select.value = "home"
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })
    expect(host.textContent).toContain("No synced Spaces on this server yet.")
    expect(host.textContent).not.toContain("Sign in")
  } finally {
    await act(async () => root.unmount())
  }
})

it("requests the password for an encrypted Space and clears it on server switch", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const cloneSyncRepository = vi
    .fn()
    .mockResolvedValue({ ok: true, snapshot: null })
  const repository = {
    name: "notes",
    displayName: "Encrypted notes",
    remoteUrl: "https://example.test/personal/notes",
    createdAtMs: 1,
    encryption: {
      profile: "encrypted-remote-v1",
      version: 1,
      suite: 1,
      uuid: "00010203-0405-4607-8809-0a0b0c0d0e0f",
    },
  }
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: {
      listCustomSyncServers: vi
        .fn()
        .mockResolvedValue([{ id: "home", name: "Home server" }]),
      getSyncPasswordSettings: vi.fn().mockResolvedValue({ configured: false }),
      getSyncStatus: vi
        .fn()
        .mockResolvedValue({ account: { state: "signed-in" }, canClone: true }),
      listSyncRepositories: vi.fn().mockResolvedValue({ repositories: [] }),
      listCustomSyncRepositories: vi
        .fn()
        .mockResolvedValue({ repositories: [repository] }),
      cloneSyncRepository,
      openSettingsDestination: vi.fn(),
    },
  })
  const host = document.createElement("div")
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(<OpenSyncedSpacePanel platform="darwin" onClose={() => {}} />)
    )
    const select = host.querySelector<HTMLSelectElement>("select")!
    await act(async () => {
      select.value = "home"
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Encrypted notes")!
        .click()
    )
    expect(host.querySelector('input[type="password"]')).not.toBeNull()
    expect(cloneSyncRepository).not.toHaveBeenCalled()
    await act(async () => {
      select.value = "official"
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })
    expect(host.querySelector('input[type="password"]')).toBeNull()
    expect(host.textContent).not.toContain("Encrypted notes")
  } finally {
    await act(async () => root.unmount())
  }
})
