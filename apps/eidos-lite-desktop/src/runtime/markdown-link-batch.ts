import fs from "node:fs/promises"
import path from "node:path"
import type { SpacePathSearchHit } from "../shared/contracts"
import type {
  MarkdownLinkMove,
  PreparedMarkdownLinkBatch,
  MarkdownLinkBatchResult,
} from "../shared/markdown-link-batch"
import {
  captureMarkdownLinkSnapshot,
  planMarkdownLinkMoves,
  applyMarkdownLinkMove,
  type MarkdownLinkSnapshot,
  type MarkdownContentStore,
} from "../main/space/markdown-link-maintenance"
import { resolveSpacePath } from "../main/space/space-paths"
import {
  openEidosLiteFileRuntime,
  type EidosLiteFileRuntime,
} from "./eidos-file-runtime"
import {
  readContentLinkDocuments,
  writeContentLinkDocuments,
} from "./content-link-updates"

/** A short-lived worker owns parsed documents, never UI Runtime residency. */
export class MarkdownLinkBatch {
  private snapshot: MarkdownLinkSnapshot | null = null
  private identities = new Map<string, { device: bigint; inode: bigint }>()

  constructor(private readonly root: string) {}

  private async withFile<T>(
    owner: string,
    operation: (runtime: EidosLiteFileRuntime) => Promise<T>,
    writing = false
  ): Promise<T> {
    if (
      owner
        .split("/")
        .some((part) =>
          [".eidos", ".graft", ".git"].includes(part.toLowerCase())
        )
    )
      throw new Error("Private files cannot own Markdown links")
    const file = resolveSpacePath(this.root, owner)
    const stats = await fs.lstat(file, { bigint: true })
    if (
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      (await fs.realpath(file)) !== file ||
      path.extname(file).toLowerCase() !== ".eidos"
    )
      throw new Error("Content owner is not an ordinary Space file")
    const expected = this.identities.get(owner)
    if (
      writing &&
      (!expected ||
        expected.device !== stats.dev ||
        expected.inode !== stats.ino)
    )
      throw new Error("Content owner was replaced after the link snapshot")
    const checkIdentity = async () => {
      const current = await fs.lstat(file, { bigint: true })
      if (
        !current.isFile() ||
        current.isSymbolicLink() ||
        current.dev !== stats.dev ||
        current.ino !== stats.ino ||
        (await fs.realpath(file)) !== file
      )
        throw new Error("Content owner changed during link maintenance")
    }
    const runtime = await openEidosLiteFileRuntime(file)
    try {
      await checkIdentity()
      const result = await operation(runtime)
      await checkIdentity()
      if (!writing)
        this.identities.set(owner, { device: stats.dev, inode: stats.ino })
      return result
    } finally {
      await runtime.close()
    }
  }

  private contentStore(): MarkdownContentStore {
    return {
      read: (owner) =>
        this.withFile(owner, (runtime) =>
          readContentLinkDocuments(runtime.source)
        ),
      write: (owner, update) =>
        this.withFile(
          owner,
          (runtime) => writeContentLinkDocuments(runtime.source, update),
          true
        ),
    }
  }

  async prepare(
    files: SpacePathSearchHit[]
  ): Promise<PreparedMarkdownLinkBatch> {
    if (this.snapshot) throw new Error("Markdown batch is already prepared")
    if (
      !path.isAbsolute(this.root) ||
      (await fs.realpath(this.root)) !== this.root
    )
      throw new Error("Markdown batch requires a canonical Space root")
    const visible = files.filter(
      (file) =>
        file.kind !== "symlink" &&
        !file.relativePath
          .split("/")
          .some((part) =>
            [".eidos", ".graft", ".git"].includes(part.toLowerCase())
          )
    )
    this.snapshot = await captureMarkdownLinkSnapshot(
      this.root,
      visible,
      this.contentStore()
    )
    return {
      owners: [
        ...new Set([
          ...this.snapshot.documents.map((document) => document.owner),
          ...this.snapshot.issues,
        ]),
      ],
      stats: {
        snapshots: 1,
        files: visible.length,
        parsedDocuments: this.snapshot.documents.length,
        contentDocuments: this.snapshot.documents.filter(
          (document) => document.record
        ).length,
        eidosReads: this.snapshot.eidosReads,
      },
    }
  }

  async apply(moves: MarkdownLinkMove[]): Promise<MarkdownLinkBatchResult> {
    if (!this.snapshot) throw new Error("Markdown batch is not prepared")
    const snapshot = this.snapshot
    this.snapshot = null
    const moved = (owner: string) =>
      moves.reduce(
        (path, move) =>
          path === move.source || path.startsWith(`${move.source}/`)
            ? move.relativePath + path.slice(move.source.length)
            : path,
        owner
      )
    this.identities = new Map(
      [...this.identities].map(([owner, identity]) => [moved(owner), identity])
    )
    const plan = await planMarkdownLinkMoves(snapshot, moves)
    return applyMarkdownLinkMove(this.root, plan, this.contentStore())
  }
}
