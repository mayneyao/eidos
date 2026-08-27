import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { RepositorySession, type StatusResult } from "@eidos.space/graft"

import { openEidosLiteFileRuntime } from "./eidos-file-runtime"

const fixtureRoot = process.env.EIDOS_LITE_CROSS_PLATFORM_FIXTURE
const describeCrossPlatform = fixtureRoot ? describe : describe.skip

function differingByteOffsets(left: Buffer, right: Buffer): number[] {
  const offsets: number[] = []
  const sharedBytes = Math.min(left.length, right.length)
  for (let offset = 0; offset < sharedBytes; offset += 1) {
    if (left[offset] !== right[offset]) offsets.push(offset)
    if (offsets.length >= 256) break
  }
  if (left.length !== right.length && offsets.length < 256) {
    offsets.push(sharedBytes)
  }
  return offsets
}

async function diagnoseDirtySqlite(
  repository: RepositorySession,
  root: string,
  status: StatusResult
): Promise<void> {
  if (!status.dirty) return

  const relativePath = "project-tracker.eidos"
  const diagnosticRoot = await mkdtemp(
    path.join(tmpdir(), "eidos-lite-cross-platform-diagnostic-")
  )
  const capturedPath = path.join(diagnosticRoot, relativePath)
  try {
    const summary = await repository.diffSqlitePaths({
      paths: [relativePath],
      mode: "summary",
    })
    const capture = await repository.captureSqliteSnapshot({
      path: relativePath,
      output: capturedPath,
    })
    const [worktreeBytes, capturedBytes] = await Promise.all([
      readFile(path.join(root, relativePath)),
      readFile(capturedPath),
    ])
    const offsets = differingByteOffsets(worktreeBytes, capturedBytes)
    console.error(
      JSON.stringify(
        {
          status,
          summary,
          capture,
          worktreeBytes: worktreeBytes.length,
          capturedBytes: capturedBytes.length,
          firstDifferingByteOffsets: offsets,
          firstDifferingPages: [
            ...new Set(offsets.map((offset) => Math.floor(offset / 4096) + 1)),
          ],
        },
        null,
        2
      )
    )
  } finally {
    await rm(diagnosticRoot, { recursive: true, force: true })
  }
}

describeCrossPlatform("cross-platform Graft clone", () => {
  it("keeps a macOS-created Eidos File clean when opened on Windows", async () => {
    const root = path.resolve(fixtureRoot!)
    const filePath = path.join(root, "project-tracker.eidos")
    const repository = await RepositorySession.open(root)
    try {
      const before = await repository.status()
      await diagnoseDirtySqlite(repository, root, before)
      expect(before).toMatchObject({ dirty: false, paths: [] })

      let opened = await openEidosLiteFileRuntime(filePath, { readOnly: true })
      await opened.close()
      expect(await repository.status()).toMatchObject({
        dirty: false,
        paths: [],
      })

      opened = await openEidosLiteFileRuntime(filePath)
      await opened.close()
      expect(await repository.status()).toMatchObject({
        dirty: false,
        paths: [],
      })
    } finally {
      await repository.close()
    }
  }, 120_000)
})
