import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"

const inputs = [
  "src/validate.ts",
  "src/profile.ts",
  "src/browser-toolchain.ts",
  "../plugin-runtime/src/",
  "../../pnpm-lock.yaml",
  "market-index.mjs",
  "scripts/generate-market-index.mjs",
]

export function validatorFingerprint() {
  const hash = createHash("sha256")
  function add(path) {
    const url = new URL(path, import.meta.url)
    if (path.endsWith("/")) {
      for (const entry of readdirSync(url, { withFileTypes: true }).sort(
        (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
      )) {
        add(path + entry.name + (entry.isDirectory() ? "/" : ""))
      }
    } else {
      const content = readFileSync(url)
      hash.update(`${path}\0${content.length}\0`).update(content)
    }
  }
  for (const input of inputs) add(input)
  return hash.digest("hex")
}

export function mobileMarketIndex() {
  return {
    name: "mobile-plugin-market-index",
    generateBundle() {
      const index = JSON.parse(
        readFileSync(new URL("./market-index.json", import.meta.url), "utf8")
      )
      // A change to the compatibility validator sends releases back through
      // the native installer. Explicit market holds survive those changes.
      const checked =
        index.validator === validatorFingerprint() ? index.checked : {}
      this.emitFile({
        type: "asset",
        fileName: "market-index.json",
        source: JSON.stringify({ checked, held: index.held }),
      })
    },
  }
}
