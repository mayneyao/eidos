import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import { windowsSyncSecretFiles as policy } from "./windows-sync-secret-files"

export async function verifyNativeWindowsSyncSecretFiles(): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-sync-acl-"))
  const directory = path.join(root, "private's storage")
  try {
    try {
      await policy.prepareDirectory(directory)
    } catch (error) {
      const cause = error instanceof Error ? error.cause : undefined
      const diagnostic =
        cause && typeof cause === "object"
          ? (cause as { code?: unknown; stderr?: unknown })
          : null
      console.error("Windows Sync directory protection failed", {
        exitCode: diagnostic?.code,
        stderr:
          typeof diagnostic?.stderr === "string"
            ? diagnostic.stderr
            : undefined,
      })
      throw error
    }
    await policy.validateDirectory(directory)
    const file = path.join(directory, "credential.bin")
    await fs.writeFile(file, "synthetic ciphertext", { flag: "wx" })
    await policy.protectFile(file)
    await policy.validateFile(file)
    const script = `
$ErrorActionPreference = 'Stop'
$acl = Get-Acl -LiteralPath $env:EIDOS_SYNC_TEST_PATH
$users = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-545')
$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($users, 'Read', 'Allow'))
Set-Acl -LiteralPath $env:EIDOS_SYNC_TEST_PATH -AclObject $acl
`
    await promisify(execFile)(
      path.join(
        process.env.SystemRoot!,
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe"
      ),
      [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(script, "utf16le").toString("base64"),
      ],
      {
        windowsHide: true,
        timeout: 15_000,
        env: { ...process.env, EIDOS_SYNC_TEST_PATH: file },
      }
    )
    await assert.rejects(policy.validateFile(file), /could not be protected/)
    const junction = path.join(root, "junction")
    await fs.symlink(directory, junction, "junction")
    await assert.rejects(
      policy.validateDirectory(junction),
      /could not be protected/
    )
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}
