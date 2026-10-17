import type { GraftSdkWorkerResponse } from "../shared/graft-sdk-contracts"

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  connect: vi.fn(),
  lock: vi.fn(),
  disconnect: vi.fn(),
}))
vi.mock("../main/graft/graft-sdk-module", () => ({
  loadEidosGraftSdk: () => ({
    RepositorySession: { open: mocks.open },
    sdkVersion: () => "test",
    operationMaterializesWorktree: () => false,
  }),
}))
vi.mock("../main/graft/encrypted-graft-host", () => ({
  EncryptedGraftHost: class {
    state = "locked"
    connect = mocks.connect
    lock = mocks.lock
    disconnect = mocks.disconnect
  },
}))

describe("Graft worker encrypted session transitions", () => {
  let receive: (event: { data: unknown }) => void
  let responses: GraftSdkWorkerResponse[]
  let descriptor: PropertyDescriptor | undefined
  let finish: (repository: unknown) => void
  let requestId: number
  const oldRepository = {
    lifecycle: "open",
    close: vi.fn(),
    listRemotes: vi.fn(),
  }
  const newRepository = {
    lifecycle: "open",
    close: vi.fn(),
    listRemotes: vi.fn(),
    clearHttpBearerToken: vi.fn(),
  }
  const command = (name: string) => {
    const id = ++requestId
    receive({
      data: {
        type: "command",
        requestId: id,
        command: name,
        args: name === "clearHttpBearerToken" ? ["origin"] : [{}],
      },
    })
    return id
  }
  const response = (id: number) =>
    responses.find(
      (value): value is Extract<GraftSdkWorkerResponse, { ok: boolean }> =>
        "ok" in value && value.requestId === id
    )
  beforeEach(async () => {
    vi.resetModules()
    vi.resetAllMocks()
    responses = []
    requestId = 0
    mocks.disconnect.mockResolvedValue(undefined)
    mocks.lock.mockResolvedValue(undefined)
    oldRepository.close.mockResolvedValue(undefined)
    newRepository.listRemotes.mockResolvedValue({
      remotes: [{ name: "origin", kind: "encrypted_http" }],
    })
    mocks.open.mockResolvedValue(oldRepository)
    mocks.connect.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    descriptor = Object.getOwnPropertyDescriptor(process, "parentPort")
    Object.defineProperty(process, "parentPort", {
      configurable: true,
      value: {
        on: (_event: string, listener: typeof receive) => {
          receive = listener
        },
        postMessage: (value: GraftSdkWorkerResponse) => {
          responses.push(value)
        },
      },
    })
    await import("./graft-worker")
    receive!({
      data: {
        type: "open",
        requestId: ++requestId,
        root: "/independent/space",
      },
    })
    await vi.waitFor(() => expect(response(1)?.ok).toBe(true))
  })
  afterEach(() => {
    if (descriptor) Object.defineProperty(process, "parentPort", descriptor)
    else Reflect.deleteProperty(process, "parentPort")
  })

  it("waits for encrypted session replacement before servicing concurrent metadata reads", async () => {
    const unlock = command("unlockEncryptedSync")
    await vi.waitFor(() => expect(mocks.connect).toHaveBeenCalledOnce())
    const read = command("listRemotes")
    await new Promise((resolve) => setImmediate(resolve))
    expect(response(read)).toBeUndefined()
    expect(oldRepository.listRemotes).not.toHaveBeenCalled()
    finish(newRepository)
    await vi.waitFor(() =>
      expect(response(read)).toMatchObject({
        ok: true,
        result: { remotes: [{ kind: "encrypted_http" }] },
      })
    )
    expect(response(unlock)?.ok).toBe(true)
  })

  it("does not delay an explicit lock behind a pending unlock", async () => {
    command("unlockEncryptedSync")
    await vi.waitFor(() => expect(mocks.connect).toHaveBeenCalledOnce())
    const lock = command("lockEncryptedSync")
    await vi.waitFor(() => expect(response(lock)?.ok).toBe(true))
    expect(mocks.lock).toHaveBeenCalledOnce()
    finish(newRepository)
    const read = command("listRemotes")
    await vi.waitFor(() => expect(response(read)?.ok).toBe(true))
  })

  it("revokes credentials immediately while waiting to clear a transitioning repository", async () => {
    command("unlockEncryptedSync")
    await vi.waitFor(() => expect(mocks.connect).toHaveBeenCalledOnce())
    const clear = command("clearHttpBearerToken")
    expect(mocks.disconnect).toHaveBeenCalledTimes(2)
    expect(response(clear)).toBeUndefined()
    finish(newRepository)
    await vi.waitFor(() => expect(response(clear)?.ok).toBe(true))
    expect(newRepository.clearHttpBearerToken).toHaveBeenCalledOnce()
  })
})
