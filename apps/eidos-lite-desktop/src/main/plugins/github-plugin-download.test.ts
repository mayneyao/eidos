import { createHash } from "node:crypto"
import { expect, it, vi } from "vitest"
import { parseGitHubPluginLink } from "../../shared/github-plugin-link"
import { downloadGitHubPlugin } from "./github-plugin-download"

const repository = "eidos-space/eidos-canvas"
const filename = "eidos.canvas-0.5.7.eidos-plugin"
const tag = "v0.5.7"
const root = `https://github.com/${repository}`
const assetUrl = `${root}/releases/download/${tag}/${filename}`
const bytes = new Uint8Array([1, 2, 3])
const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`
const asset = { name: filename, state: "uploaded", digest }
const release = (assets = [asset]) =>
  Response.json({ tag_name: tag, draft: false, assets })

it("recognizes repository, latest, tagged release and exact package links", () => {
  expect(parseGitHubPluginLink(`  github.com/${repository}.git/  `)).toEqual({
    repository,
  })
  expect(parseGitHubPluginLink(`${root}/releases/latest`)).toEqual({
    repository,
  })
  expect(
    parseGitHubPluginLink(`${root}/releases/tag/release%2F${tag}`)
  ).toEqual({ repository, tag: `release/${tag}` })
  expect(parseGitHubPluginLink(`${assetUrl}?source=share`)).toEqual({
    repository,
    tag,
    filename,
  })
  expect(
    parseGitHubPluginLink(`${root}/releases/latest/download/${filename}`)
  ).toEqual({ repository, filename })
  for (const url of [
    "https://github.com.example.com/org/repo",
    "https://github.com@another.example/org/repo",
    "https://me@github.com/org/repo",
    "https://github.com:444/org/repo",
    "http://github.com/org/repo",
    `${root}/blob/main/plugin.json`,
    `${root}/releases/download/${tag}/source.zip`,
    `${root}/releases/download/${tag}/a%2Fb.eidos-plugin`,
  ])
    expect(parseGitHubPluginLink(url)).toBeNull()
})

it("pins a repository to one release and validates its asset digest", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(release())
    .mockResolvedValueOnce(new Response(bytes))
  const downloaded = await downloadGitHubPlugin(
    { repository },
    new AbortController().signal,
    fetcher
  )
  expect(downloaded.filename).toBe(filename)
  expect(Array.from(downloaded.bytes)).toEqual(Array.from(bytes))
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    `https://api.github.com/repos/${repository}/releases/latest`,
    assetUrl,
  ])
  expect(
    fetcher.mock.calls.every(([, init]) => init?.credentials === "omit")
  ).toBe(true)
})

it("uses an exact asset link and never follows redirects outside the GitHub download hosts", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
    new Response(null, {
      status: 302,
      headers: { location: "https://another.example/plugin.eidos-plugin" },
    })
  )
  await expect(
    downloadGitHubPlugin(
      { repository, tag, filename },
      new AbortController().signal,
      fetcher
    )
  ).rejects.toThrow(/Untrusted registry download URL/)
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([assetUrl])
})

it("reports ambiguity, no package, and digest mismatch before preview", async () => {
  const signal = new AbortController().signal
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      release([asset, { ...asset, name: "extra.eidos-plugin" }])
    )
    .mockResolvedValueOnce(release([{ ...asset, name: "source.zip" }]))
    .mockResolvedValueOnce(release([{ ...asset, digest: "sha256:invalid" }]))
    .mockResolvedValueOnce(new Response(bytes))
  await expect(
    downloadGitHubPlugin({ repository }, signal, fetcher)
  ).rejects.toThrow(/multiple plugin packages/)
  await expect(
    downloadGitHubPlugin({ repository }, signal, fetcher)
  ).rejects.toThrow(/no \.eidos-plugin/)
  await expect(
    downloadGitHubPlugin({ repository }, signal, fetcher)
  ).rejects.toThrow(/checksum/)
})
