import { Sha256 } from "@aws-crypto/sha256-browser"

export async function fileChecksum(file: File): Promise<string> {
  const hash = new Sha256()
  const chunkSize = 1024 * 1024 * 100 // 100MB

  console.debug(
    `checksum file:${file.name}\n file size:${file.size} bytes\n chunk size:${chunkSize} bytes`
  )

  for (let i = 0; i < file.size; i += chunkSize) {
    const chunk = await file.slice(i, i + chunkSize).arrayBuffer()
    hash.update(new Uint8Array(chunk))
  }
  const digest = await hash.digest()
  const hashArray = Array.from(digest) // convert buffer to byte array
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("") // convert bytes to hex string
  return hashHex
}

self.onmessage = async (event) => {
  const { file } = event.data
  const hashHex = await fileChecksum(file)
  self.postMessage(hashHex)
}
