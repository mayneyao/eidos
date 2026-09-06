import fs from "node:fs/promises"

/** The destination comes only from the host's native Save dialog. */
export async function writeTextDraftCopy(
  destination: string,
  content: string
): Promise<void> {
  const handle = await fs.open(destination, "wx")
  try {
    await handle.writeFile(content, "utf8")
    await handle.sync()
  } catch (error) {
    await handle.close()
    await fs.unlink(destination).catch(() => undefined)
    throw error
  } finally {
    await handle.close()
  }
}
