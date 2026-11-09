import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { encodePackage } from "@eidos.space/plugin-runtime/package"
import type { PluginManifest } from "@eidos.space/plugin-sdk"
import { PluginStore } from "./plugin-store"
import { findSidecarCommand, PluginSidecarHost } from "./plugin-sidecar"
import {
  approveBackgroundExecution,
  approveNativeExecution,
  executionReview,
  grantReviewedExecution,
  nativeExecutionIdentity,
} from "./plugin-execution-consent"

let directory: string,
  root: string,
  executable: string,
  store: PluginStore,
  hash: string
const manifest: PluginManifest = {
  apiVersion: 1,
  id: "test.consent",
  name: "Consent",
  version: "1.0.0",
  requires: { pluginApi: "3.8.0" },
  background: { entry: "./background.js" },
  storage: { maxBytes: 4096 },
  sidecar: { command: "consent-agent", args: ["--mode", "rpc"] },
}
const bytes = (version = "1.0.0") =>
  encodePackage(
    { ...manifest, version },
    { "./background.js": "globalThis.onmessage = () => {}" }
  )
beforeEach(async () => {
  directory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "plugin-consent-"))
  )
  root = path.join(directory, "space")
  await fs.mkdir(root)
  const bin = path.join(directory, "bin")
  await fs.mkdir(bin)
  executable = path.join(bin, "consent-agent")
  await fs.writeFile(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 })
  vi.stubEnv("PATH", bin)
  store = new PluginStore(path.join(directory, "catalog"))
  hash = await store.install(bytes(), "space")
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await fs.rm(directory, { recursive: true, force: true })
})
const binding = () => ({
  owner: 1,
  space: "space",
  hash,
  cwd: root,
  manifest,
  code: "",
  authorize: async () => {},
})

it("an accepted installation review covers background and the exact native identity across host restarts", async () => {
  const review = await executionReview(manifest, hash, root)
  expect(review.detail).toContain("operating system permissions")
  expect(review.native?.executable).toBe(executable)
  await grantReviewedExecution(store, manifest, hash, "space", review, root)
  const reopened = new PluginStore(store.directory),
    confirm = vi.fn(async () => false)
  expect(
    await approveBackgroundExecution(
      reopened,
      binding(),
      new AbortController().signal,
      confirm
    )
  ).toBe(true)
  expect(
    await approveNativeExecution(
      reopened,
      binding(),
      executable,
      new AbortController().signal,
      confirm
    )
  ).toBe(true)
  expect(confirm).not.toHaveBeenCalled()
  await reopened.enable(manifest.id, true, "space")
  expect(
    await approveNativeExecution(
      reopened,
      binding(),
      executable,
      new AbortController().signal,
      confirm
    )
  ).toBe(true)
  await reopened.enable(manifest.id, false, "space")
  await reopened.enable(manifest.id, true, "space")
  expect(
    await approveBackgroundExecution(
      reopened,
      binding(),
      new AbortController().signal,
      confirm
    )
  ).toBe(false)
  expect(
    await approveNativeExecution(
      reopened,
      binding(),
      executable,
      new AbortController().signal,
      confirm
    )
  ).toBe(false)
})

it("on-demand background and native first-use approvals persist, while cancellation grants nothing", async () => {
  const deny = vi.fn(async () => false),
    allow = vi.fn(async () => true)
  expect(
    await approveBackgroundExecution(
      store,
      binding(),
      new AbortController().signal,
      deny
    )
  ).toBe(false)
  expect(
    await approveNativeExecution(
      store,
      binding(),
      executable,
      new AbortController().signal,
      deny
    )
  ).toBe(false)
  expect(
    await approveBackgroundExecution(
      store,
      binding(),
      new AbortController().signal,
      allow
    )
  ).toBe(true)
  expect(
    await approveNativeExecution(
      store,
      binding(),
      executable,
      new AbortController().signal,
      allow
    )
  ).toBe(true)
  expect(
    await approveBackgroundExecution(
      new PluginStore(store.directory),
      binding(),
      new AbortController().signal,
      deny
    )
  ).toBe(true)
  expect(
    await approveNativeExecution(
      new PluginStore(store.directory),
      binding(),
      executable,
      new AbortController().signal,
      deny
    )
  ).toBe(true)
  expect(deny).toHaveBeenCalledTimes(2)
})

it("program bytes, symlink target, arguments, root, Space and package changes invalidate native approval", async () => {
  const review = await executionReview(manifest, hash, root)
  await grantReviewedExecution(store, manifest, hash, "space", review, root)
  const original = review.native!.identity
  await fs.writeFile(executable, "#!/bin/sh\nexit 1\n")
  expect(
    await nativeExecutionIdentity(hash, manifest, root, executable)
  ).not.toBe(original)
  await fs.writeFile(executable, "#!/bin/sh\nexit 0\n")
  const target = `${executable}-target`
  await fs.rename(executable, target)
  await fs.symlink(target, executable)
  expect(
    await nativeExecutionIdentity(hash, manifest, root, executable)
  ).not.toBe(original)
  const secondRoot = path.join(directory, "other-space")
  await fs.mkdir(secondRoot)
  expect(
    await nativeExecutionIdentity(hash, manifest, secondRoot, executable)
  ).not.toBe(original)
  expect(
    await nativeExecutionIdentity(
      hash,
      {
        ...manifest,
        sidecar: { command: "consent-agent", args: ["--different"] },
      },
      root,
      executable
    )
  ).not.toBe(original)
  expect(
    await store.sidecarApproved(manifest.id, "other-space", hash, original)
  ).toBe(false)
  const next = await store.install(bytes("1.0.1"), "space")
  expect(
    await store.sidecarApproved(manifest.id, "space", next, original)
  ).toBe(false)
  expect(await store.backgroundApproved(manifest.id, "space", next)).toBe(false)
})

it("cancelled or stale approval cannot be persisted, nor can a program changed while its dialog is open", async () => {
  const abort = new AbortController()
  await expect(
    approveNativeExecution(
      store,
      binding(),
      executable,
      abort.signal,
      async () => {
        abort.abort()
        return true
      }
    )
  ).rejects.toThrow()
  await expect(
    approveNativeExecution(
      store,
      binding(),
      executable,
      new AbortController().signal,
      async () => {
        await fs.writeFile(executable, "changed program")
        return true
      }
    )
  ).rejects.toThrow("changed during approval")
  await expect(
    approveBackgroundExecution(
      store,
      binding(),
      new AbortController().signal,
      async () => {
        await store.enable(manifest.id, false, "space")
        return true
      }
    )
  ).rejects.toThrow("grant changed")
  expect((await store.config()).spaces.space.plugins[manifest.id]).toEqual({
    enabled: false,
  })
})

it("changed programs are not approved by an earlier install review and missing programs defer to first use", async () => {
  const review = await executionReview(manifest, hash, root)
  await fs.writeFile(executable, "different")
  await grantReviewedExecution(store, manifest, hash, "space", review, root)
  expect(
    await store.sidecarApproved(
      manifest.id,
      "space",
      hash,
      review.native!.identity
    )
  ).toBe(false)
  await fs.rm(executable)
  const missing = await executionReview(manifest, hash, root)
  expect(missing.native).toBeUndefined()
  expect(missing.detail).toContain("first use")
})

it("trial source grants apply only to the active trial and never authorize the installed revision after restart", async () => {
  const trial = await store.install(
    encodePackage(manifest, {
      "./background.js": "globalThis.onmessage = () => 1",
    }),
    undefined,
    false
  )
  const active = { ...binding(), hash: trial }
  expect(
    await approveBackgroundExecution(
      store,
      active,
      new AbortController().signal,
      async () => true
    )
  ).toBe(true)
  expect(
    await approveNativeExecution(
      store,
      active,
      executable,
      new AbortController().signal,
      async () => true
    )
  ).toBe(true)
  const deny = vi.fn(async () => false),
    reopened = new PluginStore(store.directory)
  expect(
    await approveBackgroundExecution(
      reopened,
      binding(),
      new AbortController().signal,
      deny
    )
  ).toBe(false)
  expect(
    await approveNativeExecution(
      reopened,
      binding(),
      executable,
      new AbortController().signal,
      deny
    )
  ).toBe(false)
})

it("Space-controlled symlink targets cannot receive native approval", async () => {
  const target = path.join(root, "agent")
  await fs.writeFile(target, "local program")
  await fs.rm(executable)
  await fs.symlink(target, executable)
  const confirm = vi.fn(async () => true)
  await expect(
    approveNativeExecution(
      store,
      binding(),
      executable,
      new AbortController().signal,
      confirm
    )
  ).rejects.toThrow("inside the Space")
  expect(confirm).not.toHaveBeenCalled()
})

it("a real native process can stop and restart under a fresh host without repeating the reviewed grant", async () => {
  vi.unstubAllEnvs()
  const nativeManifest = {
    ...manifest,
    sidecar: {
      command: "node",
      args: [
        "-e",
        "process.stdout.write(JSON.stringify({ready:true})+'\\n');process.stdin.resume()",
      ],
    },
  }
  const nativeHash = await store.install(
    encodePackage(nativeManifest, {
      "./background.js": "globalThis.onmessage = () => {}",
    }),
    "space"
  )
  const program = await findSidecarCommand("node", process.env, root)
  expect(program).not.toBeNull()
  const review = await executionReview(nativeManifest, nativeHash, root)
  await grantReviewedExecution(
    store,
    nativeManifest,
    nativeHash,
    "space",
    review,
    root
  )
  const confirm = vi.fn(async () => false),
    pids: PluginSidecarHost[] = []
  try {
    for (let turn = 0; turn < 2; turn++) {
      const reopened = new PluginStore(store.directory)
      const nativeBinding = {
        ...binding(),
        hash: nativeHash,
        manifest: nativeManifest,
      }
      const host = new PluginSidecarHost((entry, exe, signal) =>
        approveNativeExecution(reopened, entry, exe, signal, confirm)
      )
      pids.push(host)
      let ready = false
      host.observe(nativeBinding, (event) => {
        if (
          event.type === "message" &&
          event.data &&
          typeof event.data === "object" &&
          !Array.isArray(event.data) &&
          event.data.ready === true
        )
          ready = true
      })
      await host.start(nativeBinding)
      await vi.waitFor(() => expect(ready).toBe(true))
      host.stop(nativeBinding)
      await vi.waitFor(async () =>
        expect((await host.status(nativeBinding)).running).toBe(false)
      )
      host.close()
    }
    expect(confirm).not.toHaveBeenCalled()
  } finally {
    for (const host of pids) host.close()
  }
})
