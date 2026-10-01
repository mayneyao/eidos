import assert from "node:assert/strict"

// Supply a Playwright module path when it is not installed in this workspace.
const { chromium } = await import(
  process.env.EIDOS_PLAYWRIGHT_MODULE ?? "playwright"
)
const url = process.argv[2]
if (!url) throw new Error("Usage: node file-view-browser-smoke.mjs URL")
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto(url)
  const frame = page.frameLocator("iframe")
  await frame.locator("canvas").waitFor()
  await frame.getByRole("button", { name: "播放", exact: true }).click()
  await frame.getByRole("button", { name: "暂停", exact: true }).waitFor()
  await frame.getByRole("button", { name: "暂停", exact: true }).click()
  await frame.getByRole("button", { name: "详情", exact: true }).click()
  const content = await frame.locator("body").innerText()
  assert.match(content, /0\.46 km/)
  const child = page.frames().find((candidate) => candidate.parentFrame())
  const result = await child.evaluate(async () => {
    const rpc = (method, params) =>
      new Promise((resolve, reject) => {
        const id = crypto.randomUUID()
        const timer = setTimeout(() => {
          window.removeEventListener("message", receive)
          reject(new Error("RPC timeout"))
        }, 5000)
        const receive = (event) => {
          if (event.data?.id !== id) return
          clearTimeout(timer)
          window.removeEventListener("message", receive)
          resolve(event.data)
        }
        window.addEventListener("message", receive)
        parent.postMessage(
          { protocol: "eidos-plugin", apiVersion: 1, id, method, params },
          "*"
        )
      })
    let isolated = false
    try {
      void parent.document.body
    } catch {
      isolated = true
    }
    const path = "files/ride.gpx"
    return {
      isolated,
      stat: await rpc("fs.stat", { path }),
      binary: await rpc("fs.readBinary", { path }),
      url: await rpc("fs.url", { path }),
      deniedRead: await rpc("fs.readText", { path: "files/secret.txt" }),
      deniedWrite: await rpc("fs.writeText", { path, text: "changed" }),
      deniedList: await rpc("fs.list", { path }),
    }
  })
  assert.equal(result.isolated, true)
  assert.equal(result.stat.result.isDirectory, false)
  assert.equal(result.stat.result.extension, ".gpx")
  assert.match(
    Buffer.from(result.binary.result.data, "base64").toString(),
    /<gpx/
  )
  assert.match(result.url.result.url, /^data:.*;base64,/)
  for (const key of ["deniedRead", "deniedWrite", "deniedList"])
    assert.equal(result[key].error.code, "PERMISSION_DENIED")
  assert.deepEqual(errors, [])
  if (process.env.EIDOS_SMOKE_SCREENSHOT)
    await page.screenshot({ path: process.env.EIDOS_SMOKE_SCREENSHOT })
  console.log(
    JSON.stringify({
      url,
      rendered: true,
      playback: true,
      isolated: true,
      fileReads: true,
      forbiddenOperations: "denied",
      errors,
    })
  )
} finally {
  await browser.close()
}
