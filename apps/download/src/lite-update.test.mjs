import assert from "node:assert/strict"
import test from "node:test"

import { LITE_RELEASES_API, serveLiteUpdate } from "./lite-update.ts"

function release(version, names, overrides = {}) {
  const tag = `lite-v${version}`
  return {
    tag_name: tag,
    draft: false,
    prerelease: version.includes("-"),
    assets: names.map((label) => {
      const name = label.replace(" ", ".")
      return {
        name,
        label,
        browser_download_url: `https://github.com/mayneyao/eidos/releases/download/${tag}/${name}`,
      }
    }),
    ...overrides,
  }
}

function update(path, options) {
  return serveLiteUpdate(
    new Request(`https://download.eidos.space/lite/updates/${path}`, options),
    async () => "fixture-token"
  )
}

test("Lite YAML advances across channel changes while versioned assets stay pinned", async (t) => {
  const old = release("0.35.0", ["Eidos Lite-0.35.0-mac-arm64.zip.blockmap"])
  const checked = release("0.36.1", [
    "latest-mac-arm64.yml",
    "beta-mac-arm64.yml",
    "Eidos Lite-0.36.1-mac-arm64.zip",
    "Eidos Lite-0.36.1-mac-arm64.zip.blockmap",
  ])
  const next = release("0.37.0", ["latest-mac-arm64.yml", "beta-mac-arm64.yml"])
  const incomplete = release("0.38.0", ["latest-mac-x64.yml"])
  const beta = release("0.39.0-beta.2", ["beta-mac-arm64.yml"])
  const retired = release("1.0.0-rc.1", ["beta-mac-arm64.yml"])
  let list = [incomplete, retired, beta, checked]
  const fetch = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer fixture-token")
    assert.equal(new Headers(options.headers).has("Range"), false)
    assert.equal(options.redirect, "manual")
    if (url === `${LITE_RELEASES_API}?per_page=100&page=1`) {
      return Response.json(list)
    }
    if (url === `${LITE_RELEASES_API}/tags/${old.tag_name}`)
      return Response.json(old)
    if (url === `${LITE_RELEASES_API}/tags/${checked.tag_name}`)
      return Response.json(checked)
    throw new Error(`Unexpected API request ${url}`)
  })

  const metadata = "stable/arm64/latest-mac.yml?noCache=1"
  const first = await update(metadata)
  assert.equal(first.status, 302)
  assert.equal(first.headers.get("Cache-Control"), "no-store")
  assert.equal(
    first.headers.get("Location"),
    checked.assets[0].browser_download_url
  )

  list = [next, ...list]
  assert.equal(
    (await update(metadata)).headers.get("Location"),
    next.assets[0].browser_download_url
  )
  assert.equal(
    (await update("beta/arm64/beta-mac.yml")).headers.get("Location"),
    beta.assets[0].browser_download_url
  )
  for (const asset of [old.assets[0], ...checked.assets.slice(2)]) {
    const response = await update(
      `stable/arm64/${encodeURIComponent(asset.label)}`,
      {
        headers: { Range: "bytes=0-31" },
      }
    )
    assert.equal(response.status, 302)
    assert.equal(response.headers.get("Location"), asset.browser_download_url)
  }
  assert.deepEqual(
    fetch.mock.calls.slice(3).map(({ arguments: [url] }) => url),
    [
      `${LITE_RELEASES_API}/tags/${old.tag_name}`,
      `${LITE_RELEASES_API}/tags/${checked.tag_name}`,
      `${LITE_RELEASES_API}/tags/${checked.tag_name}`,
    ]
  )
})

test("Lite metadata selects the highest eligible version across GitHub pages", async (t) => {
  const stable = release("0.35.0", ["latest-win-x64.yml"])
  const newer = release("0.36.0", ["latest-win-x64.yml"])
  const draft = release("0.38.0", ["latest-win-x64.yml"], { draft: true })
  t.mock.method(globalThis, "fetch", async (url) =>
    url.endsWith("page=1")
      ? Response.json([draft, stable], {
          headers: { Link: '<page2>; rel="next"' },
        })
      : Response.json([newer])
  )
  const response = await update("stable/x64/latest.yml", { method: "HEAD" })
  assert.equal(response.status, 302)
  assert.equal(
    response.headers.get("Location"),
    newer.assets[0].browser_download_url
  )
})

test("Lite refuses upstream API redirects without forwarding credentials", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, `${LITE_RELEASES_API}?per_page=100&page=1`)
    assert.equal(options.redirect, "manual")
    assert.equal(options.headers.Authorization, "Bearer fixture-token")
    return new Response(null, {
      status: 302,
      headers: { Location: "https://example.test/releases" },
    })
  })

  const response = await update("stable/arm64/latest-mac.yml")
  assert.equal(response.status, 502)
  assert.equal(response.headers.get("Location"), null)
  assert.equal(fetch.mock.callCount(), 1)
})

test("Lite Linux arm64 metadata accepts the GenericProvider filename and the release probe alias", async (t) => {
  const stable = release("0.36.0", ["latest-linux-arm64.yml"])
  t.mock.method(globalThis, "fetch", async () => Response.json([stable]))
  for (const file of ["latest-linux.yml", "latest-linux-arm64.yml"]) {
    const response = await update(`stable/arm64/${file}`)
    assert.equal(response.status, 302)
    assert.equal(
      response.headers.get("Location"),
      stable.assets[0].browser_download_url
    )
  }
})

test("Lite lanes accept the shipped artifacts and Linux architecture aliases", async (t) => {
  const version = "0.36.1-beta.2"
  const names = [
    ["arm64", "mac-arm64.dmg"],
    ["x64", "mac-x64.zip.blockmap"],
    ["x64", "win-x64.exe"],
    ["x64", "win-x64.exe.blockmap"],
    ["x64", "linux-x86_64.AppImage"],
    ["x64", "linux-amd64.deb"],
    ["arm64", "linux-arm64.AppImage"],
    ["arm64", "linux-arm64.deb"],
  ]
  const beta = release(
    version,
    names.map(([, target]) => `Eidos Lite-${version}-${target}`)
  )
  t.mock.method(globalThis, "fetch", async () => Response.json(beta))
  for (const [index, [arch]] of names.entries()) {
    const asset = beta.assets[index]
    const response = await update(`beta/${arch}/${asset.name}`)
    assert.equal(response.status, 302)
    assert.equal(response.headers.get("Location"), asset.browser_download_url)
  }
})

test("Lite rejects unrelated, cross-channel, and wrong-architecture paths before contacting GitHub", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected API request")
  })
  for (const path of [
    "stable/x64/beta.yml",
    "beta/arm64/latest-linux.yml",
    "stable/x64/latest-mac-arm64.yml",
    "stable/x64/latest-linux-arm64.yml",
    "stable/x64/Eidos.Lite-0.36.0-mac-arm64.zip",
    "stable/arm64/Eidos.Lite-0.36.0-linux-x86_64.AppImage",
    "stable/x64/Eidos.Lite-0.36.0-beta.1-mac-x64.zip.blockmap",
    "stable/arm64/Eidos.Lite-0.36.0-linux-arm64.AppImage.blockmap",
    "stable/x64/SHA256SUMS",
    "stable/x64/a%2fmac",
    "stable/x64/%ff",
  ]) {
    const response = await update(path)
    assert.equal(response.status, 404, path)
    assert.equal(response.headers.get("Location"), null)
  }
  assert.equal(fetch.mock.callCount(), 0)
})

test("Lite versioned redirects require the exact public release and asset", async (t) => {
  const version = "0.36.0"
  const name = `Eidos Lite-${version}-mac-arm64.zip`
  const fixture = release(version, [name])
  let upstream
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url, `${LITE_RELEASES_API}/tags/lite-v${version}`)
    return upstream
  })
  const path = `stable/arm64/${encodeURIComponent(name)}`
  for (const rejected of [
    { ...fixture, draft: true },
    { ...fixture, prerelease: true },
    { ...fixture, tag_name: "lite-v0.37.0" },
    { ...fixture, assets: [] },
    null,
  ]) {
    upstream = rejected
      ? Response.json(rejected)
      : new Response(null, { status: 404 })
    const response = await update(path)
    assert.equal(response.status, 404)
    assert.equal(response.headers.get("Cache-Control"), "no-store")
  }

  fixture.assets[0].browser_download_url =
    fixture.assets[0].browser_download_url.replace(
      "/lite-v0.36.0/",
      "/lite-v0.36.1/"
    )
  upstream = Response.json(fixture)
  const response = await update(path)
  assert.equal(response.status, 502)
  assert.equal(response.headers.get("Location"), null)
})
