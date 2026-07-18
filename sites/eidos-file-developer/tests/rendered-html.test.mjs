import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const workerUrl = new URL("../dist/server/index.js", import.meta.url)
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`)
const { default: worker } = await import(workerUrl.href)

async function render(pathname = "/") {
  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    }
  )
}

test("server-renders the developer platform home", async () => {
  const response = await render()
  assert.equal(response.status, 200)
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i)

  const html = await response.text()
  assert.match(html, /Eidos File Developer Platform/)
  assert.match(html, /A local file/)
  assert.match(html, /@eidos\.space\/eidos-file@0\.1\.0/)
  assert.match(html, /The documentation is the consumer/)
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/)
})

test("server-renders every required developer journey", async () => {
  const routes = [
    ["/quickstart", /From an empty Vite app/],
    ["/build-a-view", /Views are trusted renderers/],
    ["/embed", /Your application remains the file host/],
    ["/api", /Small interfaces, explicit ownership/],
    ["/playground", /complete working-copy lifecycle/],
  ]

  for (const [pathname, expected] of routes) {
    const response = await render(pathname)
    assert.equal(response.status, 200, pathname)
    assert.match(await response.text(), expected, pathname)
  }
})

test("pins registry packages and exposes no monorepo source alias", async () => {
  const [manifestSource, viteSource, playgroundSource] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/playground.tsx", import.meta.url),
      "utf8"
    ),
  ])
  const manifest = JSON.parse(manifestSource)
  const allowTarballs = process.env.EIDOS_FILE_ALLOW_TARBALLS === "1"

  for (const name of [
    "@eidos.space/eidos-file",
    "@eidos.space/eidos-file-ui",
  ]) {
    const requested = manifest.dependencies[name]
    if (allowTarballs) {
      assert.match(requested, /^file:.*\.tgz$/)
    } else {
      assert.equal(requested, "0.1.0")
    }
  }
  assert.doesNotMatch(manifestSource, /workspace:|link:/)
  if (!allowTarballs) assert.doesNotMatch(manifestSource, /file:/)
  assert.match(viteSource, /vite-plugin-wasm/)
  assert.match(viteSource, /vite-plugin-top-level-await/)
  assert.doesNotMatch(
    playgroundSource,
    /apps\/|packages\/|ipcRenderer|zustand/i
  )
})
