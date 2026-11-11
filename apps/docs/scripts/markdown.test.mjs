import assert from "node:assert/strict"
import test from "node:test"
import {
  markdownPathForPage,
  pageMarkdown,
  pagePathForEntry,
  pagePathForMarkdown,
} from "../src/lib/markdown.ts"

test("Markdown preserves multi-pipe cells and fallback content without hidden error states", () => {
  const { markdown } = pageMarkdown(
    `<main><h1>Reference</h1>
    <table><tr><th>Values</th><th>Default</th><th>Meaning</th></tr><tr><td><code>compact|standard|comfortable</code></td><td>standard</td><td>Density</td></tr></table>
    <noscript><a href="/intel.dmg">Intel macOS</a><a href="/arm.AppImage">ARM64 AppImage</a></noscript>
    <div role="tabpanel" hidden>Windows command</div><div data-billing-period="monthly" hidden>$5 monthly</div>
    <p hidden>No matching records</p><a hidden href="/login">Session expired</a>
  </main>`,
    "https://eidos.space/reference"
  )
  assert.ok(markdown.includes("compact\\|standard\\|comfortable"))
  const row = markdown.split("\n").find((line) => line.includes("comfortable"))
  assert.equal(row.split(/(?<!\\)\|/).length, 5)
  assert.match(markdown, /Intel macOS.*https:\/\/eidos.space\/intel.dmg/)
  assert.match(markdown, /ARM64 AppImage.*https:\/\/eidos.space\/arm.AppImage/)
  assert.match(markdown, /Windows command/)
  assert.match(markdown, /\$5 monthly/)
  assert.doesNotMatch(markdown, /No matching records|Session expired/)
})

test("documentation routes round-trip, including both language homepages", () => {
  for (const [id, page, markdown] of [
    ["index", "/", "/index.md"],
    ["zh-cn/index", "/zh-cn/", "/zh-cn/index.md"],
    ["cli/index", "/cli/", "/cli.md"],
    [
      "zh-cn/getting-started/cli",
      "/zh-cn/getting-started/cli/",
      "/zh-cn/getting-started/cli.md",
    ],
  ]) {
    assert.equal(pagePathForEntry(id), page)
    assert.equal(markdownPathForPage(page), markdown)
    assert.equal(pagePathForMarkdown(markdown), page)
  }
})

test("rendered MDX content keeps all tabs, details, table data, and exact code lines", () => {
  const page = pageMarkdown(
    `<html lang="en"><head><title>Quickstart</title></head><body><aside>Navigation</aside><main>
    <h1>Quickstart<a class="sl-anchor-link">Section titled Quickstart</a></h1>
    <div role="tabpanel"><p>macOS / Linux</p></div><div role="tabpanel" hidden><p>Windows PowerShell</p></div>
    <details><summary>Versions</summary><p>Review local history.</p></details>
    <table><tr><th>Tool</th><th>Account</th></tr><tr><td>CLI</td><td>Not required</td></tr></table>
    <pre data-language="sh"><code><div class="ec-line"><div class="code">eidos --version</div></div><div class="ec-line"><div class="code">eidos file validate a.eidos</div></div></code></pre>
    <p><a href="../concepts/">Concepts</a></p><button>Copy</button>
    </main></body></html>`,
    "https://docs.eidos.space/getting-started/"
  )
  assert.match(page.markdown, /macOS \/ Linux/)
  assert.match(page.markdown, /Windows PowerShell/)
  assert.match(page.markdown, /### Versions\n\nReview local history\./)
  assert.match(page.markdown, /\| CLI\s*\| Not required/)
  assert.match(
    page.markdown,
    /```sh\neidos --version\neidos file validate a.eidos\n```/
  )
  assert.match(
    page.markdown,
    /\[Concepts\]\(https:\/\/docs.eidos.space\/concepts\/\)/
  )
  assert.doesNotMatch(page.markdown, /Navigation|Section titled|Copy/)
})
