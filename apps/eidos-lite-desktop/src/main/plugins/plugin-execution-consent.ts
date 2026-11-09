import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import type { PluginManifest } from "@eidos.space/plugin-sdk"
import { PluginError } from "@eidos.space/plugin-runtime/rpc"
import { findSidecarCommand, type SidecarBinding } from "./plugin-sidecar"
import type { BackgroundBinding } from "./plugin-background"
import type { PluginStore } from "./plugin-store"

export interface ExecutionReview {
  background: boolean
  native?: { executable: string; identity: string }
  detail: string
}

/** Consent binds the reviewed package, actual program bytes, argv and Space root. */
export async function nativeExecutionIdentity(
  hash: string,
  manifest: PluginManifest,
  cwd: string,
  executable: string,
  signal?: AbortSignal
) {
  signal?.throwIfAborted()
  const realExecutable = await fs.realpath(executable),
    root = await fs.realpath(cwd)
  const relative = path.relative(root, realExecutable)
  if (
    !relative ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`))
  )
    throw new PluginError(
      "PERMISSION_DENIED",
      "Native executable cannot be inside the Space"
    )
  const stat = await fs.stat(realExecutable)
  if (!stat.isFile())
    throw new PluginError("INVALID_REQUEST", "Native executable must be a file")
  const content = createHash("sha256")
  for await (const chunk of createReadStream(realExecutable, { signal }))
    content.update(chunk)
  signal?.throwIfAborted()
  return createHash("sha256")
    .update(
      JSON.stringify([
        hash,
        manifest.id,
        manifest.sidecar,
        executable,
        realExecutable,
        root,
        content.digest("hex"),
        stat.mode,
        stat.uid,
        stat.gid,
      ])
    )
    .digest("hex")
}

export async function executionReview(
  manifest: PluginManifest,
  hash: string,
  cwd?: string
): Promise<ExecutionReview> {
  const details: string[] = []
  if (manifest.background) {
    details.push(
      `Background: may run after its View closes${manifest.background.autoStart ? " and automatically when this Space opens" : " when a View requests it"}.`
    )
    if (manifest.background.fileHistory)
      details.push(
        "Background can observe opened file paths and times in this Space."
      )
    if (manifest.storage)
      details.push(
        "Background can read and write this plugin's device-local private storage."
      )
    details.push(
      `Background network origins: ${manifest.background.networkOrigins?.join(", ") || (manifest.background.network && manifest.background.networkOrigins === undefined ? "All public HTTPS/WSS services" : "None")}. Bluetooth devices require separate selection.`
    )
  }
  let native: ExecutionReview["native"]
  if (manifest.sidecar) {
    const executable = cwd
      ? await findSidecarCommand(manifest.sidecar.command, process.env, cwd)
      : null
    if (executable && cwd)
      native = {
        executable,
        identity: await nativeExecutionIdentity(
          hash,
          manifest,
          cwd,
          executable
        ),
      }
    details.push(
      `Native program: ${manifest.sidecar.command}. It runs with your operating system permissions, outside the plugin JavaScript sandbox and its file/network restrictions.`
    )
    details.push(
      native
        ? `Executable: ${native.executable}\nArguments: ${JSON.stringify(manifest.sidecar.args ?? [])}\nWorking folder: ${cwd}`
        : "The installed program and working folder will be reviewed on first use in a Space."
    )
  }
  if (details.length)
    details.push(
      "Approval is remembered for this Space and plugin revision. Disabling or uninstalling revokes it. A changed native program requires renewed approval. Installation does not start a native program."
    )
  return {
    background: !!manifest.background,
    ...(native ? { native } : {}),
    detail: details.join("\n\n"),
  }
}

/** Called only after the user accepted the installation/enablement review. */
export async function grantReviewedExecution(
  store: PluginStore,
  manifest: PluginManifest,
  hash: string,
  space: string,
  review: ExecutionReview,
  cwd?: string
) {
  const scope = (await store.config()).spaces[space]?.plugins[manifest.id]
  if (!scope?.enabled) return
  if (review.background) await store.approveBackground(manifest.id, space, hash)
  if (
    review.native &&
    cwd &&
    (await nativeExecutionIdentity(
      hash,
      manifest,
      cwd,
      review.native.executable
    )) === review.native.identity
  )
    await store.approveSidecar(manifest.id, space, hash, review.native.identity)
}

export async function approveBackgroundExecution(
  store: PluginStore,
  binding: BackgroundBinding,
  signal: AbortSignal,
  confirm: () => Promise<boolean>
) {
  signal.throwIfAborted()
  const approved = await store.backgroundApproved(
    binding.manifest.id,
    binding.space,
    binding.hash
  )
  if (!approved && !(await confirm())) return false
  await binding.authorize()
  signal.throwIfAborted()
  if (!approved)
    await store.approveBackground(
      binding.manifest.id,
      binding.space,
      binding.hash
    )
  return true
}

export async function approveNativeExecution(
  store: PluginStore,
  binding: SidecarBinding,
  executable: string,
  signal: AbortSignal,
  confirm: () => Promise<boolean>
) {
  const identity = await nativeExecutionIdentity(
    binding.hash,
    binding.manifest,
    binding.cwd,
    executable,
    signal
  )
  const approved = await store.sidecarApproved(
    binding.manifest.id,
    binding.space,
    binding.hash,
    identity
  )
  if (!approved && !(await confirm())) return false
  await binding.authorize()
  signal.throwIfAborted()
  if (
    (await nativeExecutionIdentity(
      binding.hash,
      binding.manifest,
      binding.cwd,
      executable,
      signal
    )) !== identity
  )
    throw new PluginError(
      "STALE_REVISION",
      "Native program changed during approval; try again"
    )
  if (!approved)
    await store.approveSidecar(
      binding.manifest.id,
      binding.space,
      binding.hash,
      identity
    )
  return true
}
