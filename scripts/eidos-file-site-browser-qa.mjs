import assert from "node:assert/strict"

import { chromium } from "playwright"

const baseUrl = process.env.EIDOS_FILE_SITE_URL ?? "http://127.0.0.1:4174"
const executablePath =
  process.env.EIDOS_FILE_CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const outputRoot = process.env.EIDOS_FILE_QA_OUTPUT ?? "/tmp/eidos-file-site-qa"

const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const consoleErrors = []
const pageErrors = []
const failedRequests = []

page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text())
})
page.on("pageerror", (error) => pageErrors.push(error.message))
page.on("requestfailed", (request) => {
  failedRequests.push(
    `${request.method()} ${request.url()} ${request.failure()?.errorText}`
  )
})

await page.goto(baseUrl, { waitUntil: "networkidle" })
await page.locator(".playground-panel").waitFor()
await page
  .locator('.session-phase[data-phase="ready"]')
  .waitFor({ timeout: 20_000 })
assert.match(
  await page.locator("body").innerText(),
  /The documentation is the consumer/
)
assert.ok((await page.locator(".timeline-record").count()) > 0)

const editableStatus = page.locator(".status-button:not([disabled])").first()
await editableStatus.click()
await page.locator('.session-phase[data-phase="dirty"]').waitFor()

await page.getByRole("button", { name: "Checkpoint" }).first().click()
await page.getByText("Recovery checkpoint created.").first().waitFor()
await page.getByRole("button", { name: "Create conflict" }).first().click()
await page.getByRole("button", { name: "Save changes" }).first().click()
await page.locator('.session-phase[data-phase="conflict"]').waitFor()
await page
  .getByRole("button", { name: "Overwrite working copy" })
  .first()
  .click()
await page.locator('.session-phase[data-phase="ready"]').waitFor()

await page.locator(".status-button:not([disabled])").nth(1).click()
await page.locator('.session-phase[data-phase="dirty"]').waitFor()
await page.getByRole("button", { name: "Fail next save" }).first().click()
await page.getByRole("button", { name: "Save changes" }).first().click()
await page.locator('.session-phase[data-phase="error"]').waitFor()
assert.match(
  await page.locator(".playground-notice").first().innerText(),
  /rejected this write once/
)
await page.getByRole("button", { name: "Restore" }).first().click()
await page.locator('.session-phase[data-phase="dirty"]').waitFor()

await page.getByRole("button", { name: "Toggle light and dark theme" }).click()
assert.equal(await page.locator("html").getAttribute("data-theme"), "dark")
await page.locator('.eidos-file-root[data-theme="dark"]').first().waitFor()
await page.evaluate(() => window.scrollTo(0, 0))

await page.screenshot({
  path: `${outputRoot}-desktop.png`,
  fullPage: true,
})

await page.getByRole("link", { name: "Build a View" }).first().click()
await page
  .getByRole("heading", { name: /Views are trusted renderers/ })
  .waitFor()

await page.setViewportSize({ width: 375, height: 812 })
await page.goto(baseUrl, { waitUntil: "networkidle" })
const mobileOverflow = await page.evaluate(() => ({
  viewport: window.innerWidth,
  visualViewport: window.visualViewport?.width,
  htmlClientWidth: document.documentElement.clientWidth,
  documentWidth: document.documentElement.scrollWidth,
  body: (() => {
    const rect = document.body.getBoundingClientRect()
    const style = getComputedStyle(document.body)
    return {
      left: rect.left,
      right: rect.right,
      width: rect.width,
      minWidth: style.minWidth,
      boxSizing: style.boxSizing,
    }
  })(),
  header: (() => {
    const element = document.querySelector(".site-header")
    if (!element) return null
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      left: rect.left,
      right: rect.right,
      width: rect.width,
      minWidth: style.minWidth,
      maxWidth: style.maxWidth,
      paddingInline: `${style.paddingLeft} / ${style.paddingRight}`,
      gridTemplateColumns: style.gridTemplateColumns,
    }
  })(),
  nav: (() => {
    const element = document.querySelector(".site-nav")
    if (!element) return null
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left,
      right: rect.right,
      width: rect.width,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }
  })(),
  elements: [...document.querySelectorAll("body *")]
    .map((element) => {
      const rect = element.getBoundingClientRect()
      return {
        tag: element.tagName,
        className: element.getAttribute("class"),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      }
    })
    .filter((item) => item.right > window.innerWidth + 1 || item.left < -1)
    .slice(0, 20),
}))
console.log(JSON.stringify({ mobileOverflow }, null, 2))
assert.equal(
  mobileOverflow.documentWidth <= mobileOverflow.viewport + 1,
  true,
  "mobile page should not overflow horizontally"
)
await page.screenshot({ path: `${outputRoot}-mobile.png`, fullPage: true })

await page.keyboard.press("Tab")
assert.notEqual(
  await page.evaluate(() => document.activeElement?.tagName),
  "BODY"
)

await browser.close()

assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join("\n")}`)
assert.deepEqual(
  failedRequests,
  [],
  `failed requests: ${failedRequests.join("\n")}`
)
assert.deepEqual(
  consoleErrors,
  [],
  `console errors: ${consoleErrors.join("\n")}`
)

console.log(
  JSON.stringify(
    {
      baseUrl,
      flows: [
        "SQLite WASM sample open",
        "Timeline mutation",
        "checkpoint",
        "conflict and forced overwrite",
        "write failure and restore",
        "dark theme",
        "documentation navigation",
        "mobile overflow and keyboard focus",
      ],
      screenshots: [`${outputRoot}-desktop.png`, `${outputRoot}-mobile.png`],
      consoleErrors,
      pageErrors,
      failedRequests,
    },
    null,
    2
  )
)
