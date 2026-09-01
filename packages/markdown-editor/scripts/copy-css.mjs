import fs from "node:fs/promises"

await fs.mkdir(new URL("../dist/", import.meta.url), { recursive: true })
await fs.copyFile(
  new URL("../src/styles.css", import.meta.url),
  new URL("../dist/styles.css", import.meta.url)
)
