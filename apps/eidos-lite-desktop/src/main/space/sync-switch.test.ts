import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { SyncSwitchJournal } from "./sync-switch"

const intent = {
  previous: "https://old.example/p/repo",
  target: "https://new.example/p/repo",
  encryptionUuid: "00010203-0405-4607-8809-0a0b0c0d0e0f",
}
let directory: string
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "sync-switch-"))
})
afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true })
})

it("restores the original binding after restart and clears the intent only after recovery", async () => {
  await new SyncSwitchJournal(directory).begin(intent)
  const restore = vi
    .fn()
    .mockRejectedValueOnce(new Error("disk unavailable"))
    .mockResolvedValue(undefined)
  const restarted = new SyncSwitchJournal(directory)
  await expect(restarted.recover(intent.previous, restore)).rejects.toThrow(
    "disk unavailable"
  )
  await restarted.recover(intent.previous, restore)
  expect(restore).toHaveBeenCalledTimes(2)
  expect(restore).toHaveBeenLastCalledWith(intent)
  await restarted.recover(intent.previous, restore)
  expect(restore).toHaveBeenCalledTimes(2)
})

it("keeps a committed new connection after restart", async () => {
  await new SyncSwitchJournal(directory).begin(intent)
  const restore = vi.fn()
  await new SyncSwitchJournal(directory).recover(intent.target, restore)
  expect(restore).not.toHaveBeenCalled()
  await expect(
    fs.stat(path.join(directory, "sync-switch.json"))
  ).rejects.toMatchObject({ code: "ENOENT" })
})

it("never overwrites a connection changed outside the pending switch", async () => {
  await new SyncSwitchJournal(directory).begin(intent)
  const restore = vi.fn()
  await expect(
    new SyncSwitchJournal(directory).recover(
      "https://third.example/p/repo",
      restore
    )
  ).rejects.toThrow("changed")
  expect(restore).not.toHaveBeenCalled()
  expect(
    (await fs.stat(path.join(directory, "sync-switch.json"))).isFile()
  ).toBe(true)
})
