import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { PeerPreferencesStore } from "./peer-preferences"
import { PeerService } from "./peer-service"

let directory: string
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "peer-preferences-"))
})
afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true })
})

it("defaults to off and restores explicitly enabled service and Spaces after restart", async () => {
  const store = new PeerPreferencesStore(directory)
  const start = vi.fn(async () => {})
  const share = vi.fn(async () => {})
  const failed = vi.fn()
  await store.restore(start, share, failed)
  expect(start).not.toHaveBeenCalled()
  const space = { id: "one", root: path.join(directory, "one") }
  await store.write({ enabled: true, spaces: [space] })
  await new PeerPreferencesStore(directory).restore(start, share, failed)
  expect(start).toHaveBeenCalledOnce()
  expect(share).toHaveBeenCalledWith(space)
  expect(failed).not.toHaveBeenCalled()
  // Closing the process only closes services, leaving this intent on disk.
  expect(await new PeerPreferencesStore(directory).read()).toEqual({
    enabled: true,
    spaces: [space],
  })
  await store.write({ enabled: false, spaces: [] })
  start.mockClear()
  await new PeerPreferencesStore(directory).restore(start, share, failed)
  expect(start).not.toHaveBeenCalled()
})

it("continues past unavailable Spaces and retains their intent for a later restart", async () => {
  const store = new PeerPreferencesStore(directory)
  const spaces = ["missing", "available"].map((id) => ({
    id,
    root: path.join(directory, id),
  }))
  await store.write({ enabled: true, spaces })
  const share = vi.fn(async ({ id }: { id: string }) => {
    if (id === "missing") throw new Error("unavailable")
  })
  const failed = vi.fn()
  await store.restore(async () => {}, share, failed)
  expect(share).toHaveBeenCalledTimes(2)
  expect(failed).toHaveBeenCalledOnce()
  expect((await store.read()).spaces).toEqual(spaces)
  await store.write({ enabled: true, spaces: [spaces[1]!] })
  share.mockClear()
  await new PeerPreferencesStore(directory).restore(
    async () => {},
    share,
    failed
  )
  expect(share).toHaveBeenCalledExactlyOnceWith(spaces[1])
})

it("does not share Spaces if the gateway cannot start or preferences are invalid", async () => {
  const store = new PeerPreferencesStore(directory)
  await store.write({ enabled: true, spaces: [{ id: "one", root: directory }] })
  const share = vi.fn(async () => {})
  await expect(
    store.restore(
      async () => {
        throw new Error("listen failed")
      },
      share,
      vi.fn()
    )
  ).rejects.toThrow("listen failed")
  expect(share).not.toHaveBeenCalled()
  await fs.writeFile(
    path.join(directory, "peer-sync", "preferences.json"),
    "broken"
  )
  await expect(store.read()).rejects.toThrow()
})

it("restarts a real gateway without creating a new pairing invitation", async () => {
  const store = new PeerPreferencesStore(directory)
  const first = new PeerService(null, directory)
  const restarted = new PeerService(null, directory)
  let restoredStatus: Awaited<ReturnType<PeerService["start"]>> | undefined
  try {
    await first.start(false)
    await store.write({ enabled: true, spaces: [] })
    await first.close()
    await new PeerPreferencesStore(directory).restore(
      async () => {
        restoredStatus = await restarted.start(false)
      },
      async () => {},
      () => {}
    )
    expect(restarted.status().running).toBe(true)
    expect(restoredStatus?.running).toBe(true)
    expect(restoredStatus?.invitation).toBeUndefined()
  } finally {
    await first.close()
    await restarted.close()
  }
})
