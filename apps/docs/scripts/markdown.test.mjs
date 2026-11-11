import assert from "node:assert/strict"
import test from "node:test"
import {
  markdownPathForPage,
  pageMarkdown,
  pagePathForEntry,
  pagePathForMarkdown,
} from "../src/lib/markdown.ts"

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
