/** Small ZIP writer using the stored method: deterministic, no runtime dependency. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

export function zipFiles(
  files: Readonly<Record<string, string | Uint8Array>>
): Blob {
  const encoder = new TextEncoder()
  const chunks: Uint8Array<ArrayBuffer>[] = []
  const directory: Uint8Array<ArrayBuffer>[] = []
  let offset = 0
  for (const [path, content] of Object.entries(files)) {
    if (
      !path ||
      path.startsWith("/") ||
      path.includes("\\") ||
      path.split("/").includes("..")
    )
      throw new Error("Unsafe archive path")
    const name = encoder.encode(path)
    const bytes =
      typeof content === "string"
        ? encoder.encode(content)
        : new Uint8Array(content)
    const crc = crc32(bytes)
    const local = new Uint8Array(30 + name.length)
    const header = new DataView(local.buffer)
    header.setUint32(0, 0x04034b50, true)
    header.setUint16(4, 20, true)
    header.setUint16(6, 0x0800, true)
    header.setUint16(12, 0x21, true) // 1980-01-01: deterministic DOS date.
    header.setUint32(14, crc, true)
    header.setUint32(18, bytes.length, true)
    header.setUint32(22, bytes.length, true)
    header.setUint16(26, name.length, true)
    local.set(name, 30)
    chunks.push(local, bytes)
    const central = new Uint8Array(46 + name.length)
    const entry = new DataView(central.buffer)
    entry.setUint32(0, 0x02014b50, true)
    entry.setUint16(4, 20, true)
    entry.setUint16(6, 20, true)
    entry.setUint16(8, 0x0800, true)
    entry.setUint16(14, 0x21, true)
    entry.setUint32(16, crc, true)
    entry.setUint32(20, bytes.length, true)
    entry.setUint32(24, bytes.length, true)
    entry.setUint16(28, name.length, true)
    entry.setUint32(42, offset, true)
    central.set(name, 46)
    directory.push(central)
    offset += local.length + bytes.length
  }
  const end = new Uint8Array(22)
  const trailer = new DataView(end.buffer)
  trailer.setUint32(0, 0x06054b50, true)
  trailer.setUint16(8, directory.length, true)
  trailer.setUint16(10, directory.length, true)
  trailer.setUint32(
    12,
    directory.reduce((size, item) => size + item.length, 0),
    true
  )
  trailer.setUint32(16, offset, true)
  return new Blob([...chunks, ...directory, end], { type: "application/zip" })
}

export async function downloadProject(
  files: Record<string, string>
): Promise<void> {
  const response = await fetch("/downloads/markdown.tgz", { cache: "no-store" })
  if (!response.ok)
    throw new Error(
      "Package artifact unavailable. Download from a production build of the site."
    )
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.length > 10 * 1024 * 1024 || bytes[0] !== 0x1f || bytes[1] !== 0x8b)
    throw new Error(
      "Invalid package artifact. Build the site before downloading."
    )
  const url = URL.createObjectURL(
    zipFiles({ ...files, "vendor/markdown.tgz": bytes })
  )
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = "my-markdown-editor.zip"
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
