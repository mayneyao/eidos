// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { CustomSyncSetup } from "./custom-sync-setup"
import type { EidosSyncProgress } from "../shared/contracts"

it("shows transfer activity without inventing a total or rounding small transfers to zero", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let finish!: (value: unknown) => void
  const result = new Promise((resolve) => {
    finish = resolve
  })
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: {
      getSparkStatus: vi
        .fn()
        .mockResolvedValue({
          state: "active",
          features: ["custom-graft-sync"],
          licenses: [],
        }),
      listCustomSyncServers: vi
        .fn()
        .mockResolvedValue([
          {
            id: "home",
            name: "Home",
            origin: "https://example.test",
            credentialAvailable: true,
          },
        ]),
      getSyncStatus: vi
        .fn()
        .mockResolvedValue({
          canEnable: true,
          deviceUnlockAvailable: true,
          defaultPasswordConfigured: true,
        }),
      getSyncPreflight: vi
        .fn()
        .mockResolvedValue({
          manifestId: "manifest",
          blockerCount: 0,
          fileCount: 1,
          totalBytes: 8192,
        }),
      enableSync: vi.fn().mockReturnValue(result),
    },
  })
  const host = document.createElement("div")
  const root = createRoot(host)
  const progress: EidosSyncProgress = {
    runId: "connect",
    operation: "connect",
    state: "active",
    phase: "push",
    detail: "Uploading this Space",
    startedAtMs: 0,
    phaseStartedAtMs: 0,
    elapsedMs: 100,
    transfer: {
      direction: "upload",
      transferredBytes: 2048,
      totalBytes: null,
      bytesPerSecond: 0,
      estimatedRemainingMs: null,
    },
  }
  const render = (value?: EidosSyncProgress) => (
    <CustomSyncSetup
      onBack={() => {}}
      onConnected={() => {}}
      initialServerId="home"
      progress={value}
    />
  )
  try {
    await act(async () => root.render(render()))
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Connect")!
        .click()
    )
    await act(async () => root.render(render(progress)))
    expect(host.querySelector(".custom-sync-progress")?.textContent).toContain(
      "Uploaded 2 KiB"
    )
    expect(host.querySelector(".custom-sync-progress progress")).toBeNull()
    await act(async () =>
      root.render(
        render({
          ...progress,
          transfer: {
            ...progress.transfer!,
            direction: "download",
            transferredBytes: 512,
            totalBytes: 2048,
          },
        })
      )
    )
    expect(host.querySelector(".custom-sync-progress")?.textContent).toContain(
      "Receiving data from server"
    )
    expect(host.querySelector(".custom-sync-progress")?.textContent).toContain(
      "Downloaded 512 bytes"
    )
    expect(host.querySelector("progress")?.getAttribute("value")).toBe("512")
    expect(host.querySelector("progress")?.getAttribute("max")).toBe("2048")
  } finally {
    await act(async () => {
      finish({ ok: true, status: { remote: { state: "connected" } } })
      await result
    })
    await act(async () => root.unmount())
  }
})

it("offers a retry if Spark or saved servers cannot be loaded", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const getSparkStatus = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({
      state: "active",
      features: ["custom-graft-sync"],
      licenses: [],
    })
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: {
      getSparkStatus,
      listCustomSyncServers: vi.fn().mockResolvedValue([]),
    },
  })
  const host = document.createElement("div")
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(<CustomSyncSetup onBack={() => {}} onConnected={() => {}} />)
    )
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Could not load custom server settings"
    )
    expect(host.textContent).not.toContain("Checking Spark…")
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Try again")!
        .click()
    )
    expect(getSparkStatus).toHaveBeenCalledTimes(2)
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(host.textContent).toContain("Add a server in Account & Services")
  } finally {
    await act(async () => root.unmount())
  }
})

it("offers Eidos Sync as a switch destination for a custom connection", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const getSyncStatus = vi.fn().mockResolvedValue({ canEnable: true })
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: {
      getSparkStatus: vi
        .fn()
        .mockResolvedValue({ state: "inactive", features: [], licenses: [] }),
      listCustomSyncServers: vi.fn().mockResolvedValue([]),
      getSyncStatus,
      getSyncPreflight: vi.fn().mockResolvedValue({
        manifestId: "manifest",
        blockerCount: 0,
        fileCount: 0,
        totalBytes: 0,
      }),
    },
  })
  const host = document.createElement("div")
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <CustomSyncSetup
          onBack={() => {}}
          onConnected={() => {}}
          switchFrom="https://old.example.test/personal/space"
        />
      )
    )
    await act(async () => {
      const select = host.querySelector("select")!
      select.value = "official"
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })
    expect(getSyncStatus).toHaveBeenCalledWith({ provider: "official" })
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Set a sync password")!
        .click()
    )
    expect(host.querySelectorAll('input[type="password"]')).toHaveLength(2)
  } finally {
    await act(async () => root.unmount())
  }
})

it("uses the device sync password without asking for it again", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const server = {
    id: "server-1",
    name: "Home",
    origin: "https://example.test",
    credentialAvailable: true,
  }
  const enableSync = vi
    .fn()
    .mockResolvedValue({ ok: true, status: { remote: { state: "connected" } } })
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: {
      getSparkStatus: vi.fn().mockResolvedValue({
        state: "active",
        features: ["custom-graft-sync"],
        licenses: [],
      }),
      listCustomSyncServers: vi.fn().mockResolvedValue([server]),
      getSyncStatus: vi.fn().mockResolvedValue({
        canEnable: true,
        deviceUnlockAvailable: true,
        defaultPasswordConfigured: true,
      }),
      getSyncPreflight: vi.fn().mockResolvedValue({
        manifestId: "manifest",
        blockerCount: 0,
        fileCount: 1,
        totalBytes: 1048576,
      }),
      enableSync,
    },
  })
  const host = document.createElement("div")
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <CustomSyncSetup
          onBack={() => {}}
          onConnected={() => {}}
          initialServerId="server-1"
        />
      )
    )
    expect(host.querySelectorAll('input[type="password"]')).toHaveLength(0)
    expect(host.textContent).toContain("1 MiB")
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Connect")!
        .click()
    )
    expect(enableSync).toHaveBeenCalledWith(
      { manifestId: "manifest" },
      undefined,
      { provider: "custom", serverId: "server-1" }
    )
  } finally {
    await act(async () => root.unmount())
  }
})

it.each([undefined, "https://old.example.test/personal/space"])(
  "uses a saved server and requires a separate password before connecting (previous: %s)",
  async (switchFrom) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const server = {
      id: "server-1",
      name: "Home",
      origin: "https://example.test",
      credentialAvailable: true,
    }
    const preview = { canEnable: true, blocker: null }
    const getSyncPreflight = vi.fn().mockResolvedValue({
      manifestId: "manifest",
      blockerCount: 0,
      fileCount: 1,
      totalBytes: 100,
    })
    let submittedPassword = ""
    const enableSync = vi.fn(async (_approval, encryption) => {
      submittedPassword = new TextDecoder().decode(encryption.password)
      return {
        ok: true,
        status: { provider: "custom", remote: { state: "connected" } },
      }
    })
    const saveCustomSyncServer = vi.fn().mockResolvedValue(server)
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSparkStatus: vi.fn().mockResolvedValue({
          state: "active",
          features: ["custom-graft-sync"],
          licenses: [],
        }),
        listCustomSyncServers: vi.fn().mockResolvedValue([server]),
        saveCustomSyncServer,
        getSyncStatus: vi.fn().mockResolvedValue(preview),
        getSyncPreflight,
        enableSync,
      },
    })
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const onConnected = vi.fn()
    const fill = (input: HTMLInputElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!
      setter.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    }
    try {
      await act(async () =>
        root.render(
          <CustomSyncSetup
            onBack={() => {}}
            onConnected={onConnected}
            switchFrom={switchFrom}
          />
        )
      )
      await act(async () => {
        const select = host.querySelector("select")!
        select.value = server.id
        select.dispatchEvent(new Event("change", { bubbles: true }))
      })
      expect(saveCustomSyncServer).not.toHaveBeenCalled()
      expect(enableSync).not.toHaveBeenCalled()
      expect(host.querySelectorAll('input[type="password"]')).toHaveLength(0)
      await act(async () =>
        [...host.querySelectorAll("button")]
          .find((button) => button.textContent === "Set a sync password")!
          .click()
      )
      const passwords = host.querySelectorAll<HTMLInputElement>(
        'input[type="password"]'
      )
      expect(passwords).toHaveLength(2)
      await act(async () => {
        fill(passwords[0], "space-password")
        fill(passwords[1], "space-password")
      })
      await act(async () =>
        [...host.querySelectorAll("button")]
          .find(
            (button) =>
              button.textContent === (switchFrom ? "Switch server" : "Connect")
          )!
          .click()
      )
      expect(enableSync).toHaveBeenCalledWith(
        { manifestId: "manifest", ...(switchFrom ? { switchFrom } : {}) },
        expect.anything(),
        { provider: "custom", serverId: "server-1" }
      )
      expect(submittedPassword).toBe("space-password")
      expect(onConnected).toHaveBeenCalledOnce()
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  }
)
