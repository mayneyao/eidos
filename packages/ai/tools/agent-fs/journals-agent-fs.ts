import type { IFileSystem, FsStat, FileContent } from "@eidos.space/just-bash"
import type { DataSpace } from "@/packages/core/data-space"

const DEFAULT_FILE_MODE = 0o644
const DEFAULT_DIR_MODE = 0o755

interface DirentEntry {
  name: string
  isFile: boolean
  isDirectory: boolean
  isSymbolicLink: boolean
}

interface DayPage {
  id: string
  markdown: string
}

function notFound(path: string): never {
  const err = new Error(`ENOENT: no such file or directory, '${path}'`) as any
  err.code = "ENOENT"
  throw err
}

function permDenied(path: string): never {
  const err = new Error(`EPERM: operation not permitted, '${path}'`) as any
  err.code = "EPERM"
  throw err
}

/**
 * An IFileSystem backed by eidos__docs (is_day_page = 1).
 * Mounts journal day pages as .md files at /journals/.
 * Supports reading, writing (create/update), and searching journals.
 */
export class JournalsAgentFs implements IFileSystem {
  private ds: DataSpace
  private loaded = false
  /** date string (YYYY-MM-DD) → markdown content */
  private pages = new Map<string, string>()

  constructor(ds: DataSpace) {
    this.ds = ds
  }

  /** Load all day pages into memory */
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return

    const rows = (await this.ds.db.selectObjects(
      `SELECT id, markdown FROM eidos__docs WHERE is_day_page = 1 ORDER BY id DESC`
    )) as DayPage[]

    for (const row of rows) {
      this.pages.set(row.id, row.markdown || "")
    }

    this.loaded = true
  }

  async healthCheck(): Promise<void> {
    await this.ds.db.selectObjects(
      `SELECT id FROM eidos__docs WHERE is_day_page = 1 LIMIT 1`
    )
  }

  private normalize(path: string): string {
    if (!path.startsWith("/")) path = "/" + path
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1)
    return path
  }

  /** Extract date from path like "/2024-01-15.md" → "2024-01-15" */
  private extractDate(normalizedPath: string): string | null {
    const match = normalizedPath.match(/^\/(\d{4}-\d{2}-\d{2})(?:\.md)?$/)
    return match ? match[1] : null
  }

  private decodeContent(
    content: FileContent,
    options?: { encoding?: string } | string
  ): string {
    if (typeof content === "string") return content
    const encoding =
      typeof options === "string" ? options : (options?.encoding ?? "utf-8")
    return new TextDecoder(encoding).decode(content)
  }

  // ── IFileSystem implementation ─────────────────────────────────────

  async readdir(path: string): Promise<string[]> {
    await this.ensureLoaded()
    const normalized = this.normalize(path)
    if (normalized !== "/") notFound(path)
    return [...this.pages.keys()]
      .sort((a, b) => b.localeCompare(a))
      .map((date) => `${date}.md`)
  }

  async readdirWithFileTypes(path: string): Promise<DirentEntry[]> {
    await this.ensureLoaded()
    const normalized = this.normalize(path)
    if (normalized !== "/") notFound(path)
    return [...this.pages.keys()]
      .sort((a, b) => b.localeCompare(a))
      .map((date) => ({
        name: `${date}.md`,
        isFile: true,
        isDirectory: false,
        isSymbolicLink: false,
      }))
  }

  async readFile(path: string): Promise<string> {
    await this.ensureLoaded()
    const normalized = this.normalize(path)

    if (normalized === "/") {
      const err = new Error(
        `EISDIR: illegal operation on a directory, '${path}'`
      ) as any
      err.code = "EISDIR"
      throw err
    }

    const date = this.extractDate(normalized)
    if (!date) notFound(path)

    const markdown = this.pages.get(date!)
    if (markdown === undefined) notFound(path)

    return markdown!
  }

  async readFileBuffer(path: string): Promise<Uint8Array> {
    const content = await this.readFile(path)
    return new TextEncoder().encode(content)
  }

  async stat(path: string): Promise<FsStat> {
    await this.ensureLoaded()
    const normalized = this.normalize(path)

    if (normalized === "/") {
      return {
        isFile: false,
        isDirectory: true,
        isSymbolicLink: false,
        mode: DEFAULT_DIR_MODE,
        size: 0,
        mtime: new Date(),
      }
    }

    const date = this.extractDate(normalized)
    if (!date || !this.pages.has(date)) notFound(path)

    return {
      isFile: true,
      isDirectory: false,
      isSymbolicLink: false,
      mode: DEFAULT_FILE_MODE,
      size: (this.pages.get(date!) || "").length,
      mtime: new Date(),
    }
  }

  async lstat(path: string): Promise<FsStat> {
    return this.stat(path)
  }

  async exists(path: string): Promise<boolean> {
    await this.ensureLoaded()
    const normalized = this.normalize(path)
    if (normalized === "/") return true
    const date = this.extractDate(normalized)
    return date !== null && this.pages.has(date)
  }

  async realpath(path: string): Promise<string> {
    return this.normalize(path)
  }

  resolvePath(_base: string, path: string): string {
    if (path.startsWith("/")) return path
    return _base === "/" ? `/${path}` : `${_base}/${path}`
  }

  getAllPaths(): string[] {
    return []
  }

  // ── Write operations ───────────────────────────────────────────────

  async writeFile(
    path: string,
    content: FileContent,
    options?: { encoding?: string } | string
  ): Promise<void> {
    await this.ensureLoaded()
    const normalized = this.normalize(path)
    const date = this.extractDate(normalized)
    if (!date) {
      const err = new Error(
        `EINVAL: invalid journal filename, '${path}' (expected YYYY-MM-DD.md)`
      ) as any
      err.code = "EINVAL"
      throw err
    }

    const markdown = this.decodeContent(content, options)

    // Use the DataSpace API which handles markdown→Lexical conversion and is_day_page flag
    await this.ds.createOrUpdateDocWithMarkdown(date!, markdown)

    // Update in-memory cache
    this.pages.set(date!, markdown)
  }

  async appendFile(
    path: string,
    content: FileContent,
    options?: { encoding?: string } | string
  ): Promise<void> {
    await this.ensureLoaded()
    const normalized = this.normalize(path)
    const date = this.extractDate(normalized)
    if (!date) notFound(path)

    const markdown = this.decodeContent(content, options)

    // Use createOrUpdate with append mode for proper Lexical state merging
    await this.ds.doc.createOrUpdate({
      id: date!,
      text: markdown,
      type: "markdown",
      mode: "append",
    })

    // Update in-memory cache (append to existing)
    const existing = this.pages.get(date!) ?? ""
    this.pages.set(date!, existing + markdown)
  }

  async mkdir(path: string): Promise<void> {
    permDenied(path)
  }

  async rm(path: string): Promise<void> {
    permDenied(path)
  }

  async cp(_src: string, dest: string): Promise<void> {
    permDenied(dest)
  }

  async mv(_src: string, dest: string): Promise<void> {
    permDenied(dest)
  }

  async chmod(path: string): Promise<void> {
    permDenied(path)
  }

  async symlink(_target: string, linkPath: string): Promise<void> {
    permDenied(linkPath)
  }

  async link(_existingPath: string, newPath: string): Promise<void> {
    permDenied(newPath)
  }

  async readlink(path: string): Promise<string> {
    notFound(path)
  }

  async utimes(path: string): Promise<void> {
    permDenied(path)
  }
}
