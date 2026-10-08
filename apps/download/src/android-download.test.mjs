import assert from "node:assert/strict"
import test from "node:test"

import { serveAndroidDownload } from "./android-download.ts"
import { selectEidosAndroidDownload } from "./release-routing.mjs"

function release(version, overrides = {}) {
  const tag = `android-v${version}`
  return {
    tag_name: tag,
    draft: false,
    prerelease: version.includes("-"),
    assets: [
      {
        name: `eidos-android-${version}.apk`,
        browser_download_url: `https://github.com/mayneyao/eidos/releases/download/${tag}/eidos-android-${version}.apk`,
      },
    ],
    ...overrides,
  }
}

function request(query = "?channel=beta", method = "GET") {
  return new Request(`https://download.eidos.space/android${query}`, { method })
}

test("Android version selection isolates products, drafts, and channel metadata", () => {
  const stable = release("0.1.0")
  const beta = release("0.2.0-beta.10")
  const releases = [
    release("99.0.0", { tag_name: "lite-v99.0.0" }),
    release("99.0.0", { tag_name: "cli-v99.0.0" }),
    release("99.0.0-beta.1", { draft: true }),
    release("99.0.0-beta.2", { prerelease: false }),
    release("99.0.0", { prerelease: true }),
    release("0.2.0-beta.2"),
    stable,
    beta,
  ]
  assert.equal(selectEidosAndroidDownload(releases, "stable").release, stable)
  assert.equal(
    selectEidosAndroidDownload(releases.reverse(), "beta").release,
    beta
  )
  assert.equal(selectEidosAndroidDownload([beta], "stable"), null)
  assert.equal(
    selectEidosAndroidDownload([stable, release("0.1.0-rc.1")], "beta").release,
    stable
  )
})

test("Android selection requires the matching APK and skips incomplete releases", () => {
  const ready = release("0.1.0-beta.2")
  const wrongAsset = release("0.2.0-beta.1", {
    assets: [
      {
        name: "unrelated.apk",
        browser_download_url: "https://github.com/other.apk",
      },
    ],
  })
  assert.equal(
    selectEidosAndroidDownload(
      [release("0.3.0", { assets: [] }), wrongAsset, ready],
      "beta"
    ).release,
    ready
  )
  assert.equal(selectEidosAndroidDownload([wrongAsset], "beta"), null)
})

test("Android beta entry point advances when a new release is published", async (t) => {
  let current = release("0.1.0-beta.2")
  t.mock.method(globalThis, "fetch", async () => Response.json([current]))
  const first = await serveAndroidDownload(request())
  assert.equal(first.status, 302)
  assert.equal(
    first.headers.get("Location"),
    current.assets[0].browser_download_url
  )
  assert.equal(first.headers.get("Cache-Control"), "public, max-age=60")
  current = release("0.1.0-beta.3")
  const next = await serveAndroidDownload(request())
  assert.equal(
    next.headers.get("Location"),
    current.assets[0].browser_download_url
  )
})

test("Android default stays stable and does not silently download a beta", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json([release("0.1.0-beta.2")])
  )
  const response = await serveAndroidDownload(request(""))
  assert.equal(response.status, 404)
  assert.equal(response.headers.get("Location"), null)
  assert.equal(response.headers.get("Cache-Control"), "no-store")
})

test("Android lookup scans subsequent pages and keeps the highest usable version", async (t) => {
  const highest = release("0.2.0-beta.1")
  const calls = []
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options })
    if (new URL(url).searchParams.get("page") === "1") {
      return Response.json([release("0.1.0-beta.2")], {
        headers: {
          Link: '<https://api.github.com/repos/mayneyao/eidos/releases?per_page=100&page=2>; rel="next"',
        },
      })
    }
    return Response.json([highest, release("0.1.0-beta.1")])
  })
  const response = await serveAndroidDownload(request(), "test-token")
  assert.equal(
    response.headers.get("Location"),
    highest.assets[0].browser_download_url
  )
  assert.equal(calls.length, 2)
  assert.equal(
    calls[1].url,
    "https://api.github.com/repos/mayneyao/eidos/releases?per_page=100&page=2"
  )
  assert.equal(calls[1].options.headers.Authorization, "Bearer test-token")
})

test("Android lookup can find an APK beyond unrelated product releases", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    if (new URL(url).searchParams.get("page") === "1") {
      return Response.json([release("9.0.0", { tag_name: "cli-v9.0.0" })], {
        headers: {
          Link: '<https://api.github.com/repos/mayneyao/eidos/releases?page=2>; rel="next"',
        },
      })
    }
    return Response.json([release("0.1.0-beta.2")])
  })
  assert.equal((await serveAndroidDownload(request())).status, 302)
})

test("Android routes reject unsupported options and methods before GitHub fetch", async (t) => {
  const upstream = t.mock.method(globalThis, "fetch", async () => {
    assert.fail("Invalid requests must not call GitHub")
  })
  for (const query of ["?channel=nightly", "?format=exe", "?arch=arm64"]) {
    assert.equal((await serveAndroidDownload(request(query))).status, 400)
  }
  const response = await serveAndroidDownload(request("", "POST"))
  assert.equal(response.status, 405)
  assert.equal(response.headers.get("Allow"), "GET, HEAD")
  assert.equal(upstream.mock.callCount(), 0)
})

test("Android HEAD and explicit APK format use the same redirect", async (t) => {
  const current = release("0.1.0")
  t.mock.method(globalThis, "fetch", async () => Response.json([current]))
  const response = await serveAndroidDownload(
    request("?channel=stable&format=apk", "HEAD")
  )
  assert.equal(response.status, 302)
  assert.equal(
    response.headers.get("Location"),
    current.assets[0].browser_download_url
  )
  assert.equal(await response.text(), "")
})

test("Android does not cache upstream failures or rate limits", async (t) => {
  const upstream = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("unavailable", { status: 500 })
  )
  assert.equal((await serveAndroidDownload(request())).status, 502)
  upstream.mock.mockImplementation(
    async () =>
      new Response("limited", {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" },
      })
  )
  const limited = await serveAndroidDownload(request())
  assert.equal(limited.status, 429)
  assert.equal(limited.headers.get("Cache-Control"), "no-store")
  upstream.mock.mockImplementation(async () => {
    throw new Error("network unavailable")
  })
  assert.equal((await serveAndroidDownload(request())).status, 502)
})

test("Android rejects malformed API data and unexpected download hosts", async (t) => {
  const upstream = t.mock.method(globalThis, "fetch", async () =>
    Response.json([{ tag_name: "android-v0.1.0" }])
  )
  assert.equal((await serveAndroidDownload(request())).status, 502)
  upstream.mock.mockImplementation(async () =>
    Response.json([
      release("0.1.0", {
        assets: [
          {
            name: "eidos-android-0.1.0.apk",
            browser_download_url: "https://other.example/app.apk",
          },
        ],
      }),
    ])
  )
  assert.equal((await serveAndroidDownload(request())).status, 502)
})

test("Android cannot redirect from a partial version list at the pagination limit", async (t) => {
  const upstream = t.mock.method(globalThis, "fetch", async () =>
    Response.json([release("0.1.0")], {
      headers: {
        Link: '<https://api.github.com/repos/mayneyao/eidos/releases?page=99>; rel="next"',
      },
    })
  )
  const response = await serveAndroidDownload(request())
  assert.equal(response.status, 503)
  assert.equal(response.headers.get("Location"), null)
  assert.equal(upstream.mock.callCount(), 10)
})
