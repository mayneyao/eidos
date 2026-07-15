import { createHash } from "node:crypto"
import type { NormalizedExtensionPermissions } from "@eidos.space/extension-manifest"
import type {
  ExtensionFileChange,
  ExtensionInstallFile,
  ExtensionPermissionChange,
} from "./types"
import { extensionPermissionEntries } from "./types"

function fileFingerprint(file: ExtensionInstallFile): string {
  return createHash("sha256").update(file.content).digest("hex")
}

export function diffExtensionFiles(
  before: readonly ExtensionInstallFile[],
  after: readonly ExtensionInstallFile[]
): ExtensionFileChange[] {
  const previous = new Map(before.map((file) => [file.path, file]))
  const next = new Map(after.map((file) => [file.path, file]))
  const paths = [...new Set([...previous.keys(), ...next.keys()])].sort(
    (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))
  )
  return paths.flatMap((path): ExtensionFileChange[] => {
    const left = previous.get(path)
    const right = next.get(path)
    if (!left && right) {
      return [{ path, kind: "added", afterSize: right.content.byteLength }]
    }
    if (left && !right) {
      return [{ path, kind: "removed", beforeSize: left.content.byteLength }]
    }
    if (left && right && fileFingerprint(left) !== fileFingerprint(right)) {
      return [
        {
          path,
          kind: "modified",
          beforeSize: left.content.byteLength,
          afterSize: right.content.byteLength,
        },
      ]
    }
    return []
  })
}

export function diffExtensionPermissions(
  before: NormalizedExtensionPermissions | undefined,
  after: NormalizedExtensionPermissions | undefined
): ExtensionPermissionChange[] {
  const previous = new Map(
    extensionPermissionEntries(before).map((entry) => [
      `${entry.kind}\0${entry.value}`,
      entry,
    ])
  )
  const next = new Map(
    extensionPermissionEntries(after).map((entry) => [
      `${entry.kind}\0${entry.value}`,
      entry,
    ])
  )
  return [...new Set([...previous.keys(), ...next.keys()])]
    .sort()
    .flatMap((key): ExtensionPermissionChange[] => {
      const left = previous.get(key)
      const right = next.get(key)
      if (!left && right) return [{ ...right, change: "added" }]
      if (left && !right) return [{ ...left, change: "removed" }]
      return []
    })
}
