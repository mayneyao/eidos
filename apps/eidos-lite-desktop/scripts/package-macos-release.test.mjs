import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import {
  appendFile,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { gzipSync } from "node:zlib"
import { stringify } from "yaml"
import { finalizeDmg } from "./finalize-macos-dmg.mjs"
import {
  packageWithRetry,
  verifyMacUpdateInfo,
} from "./package-macos-release.mjs"

function runner(results) {
  let calls = 0
  const delays = []
  return {
    get calls() {
      return calls
    },
    delays,
    options: {
      run: async () => results[calls++],
      delay: async (ms) => {
        delays.push(ms)
      },
      warn: () => {},
    },
  }
}

test("successful packaging runs exactly once", async () => {
  const fixture = runner([{ code: 0, output: "" }])
  await packageWithRetry(fixture.options)
  assert.equal(fixture.calls, 1)
  assert.deepEqual(fixture.delays, [])
})

test("Apple ticket-delivery disconnect retries packaging without rebuilding", async () => {
  const fixture = runner([
    {
      code: 1,
      output:
        'NSURLErrorDomain Code=-1005 "The network connection was lost."\nThe staple and validate action failed! Error 68.',
    },
    { code: 0, output: "notarization successful" },
  ])
  await packageWithRetry(fixture.options)
  assert.equal(fixture.calls, 2)
  assert.deepEqual(fixture.delays, [10_000])
})

test("transient failures stop after three attempts", async () => {
  const fixture = runner(
    Array.from({ length: 3 }, () => ({ code: 1, output: "ECONNRESET" }))
  )
  await assert.rejects(packageWithRetry(fixture.options), /packaging failed/)
  assert.equal(fixture.calls, 3)
  assert.deepEqual(fixture.delays, [10_000, 20_000])
})

test("credentials, signatures, rejected notarization and signals fail immediately", async () => {
  for (const failure of [
    { code: 1, output: "Invalid credentials" },
    { code: 1, output: "ECONNRESET recovered earlier\nInvalid credentials" },
    { code: 1, output: "code object is not signed at all" },
    { code: 1, output: "notarization rejected: Invalid" },
    { code: 1, output: "The staple and validate action failed! Error 68." },
    { code: null, signal: "SIGTERM", output: "ECONNRESET" },
  ]) {
    const fixture = runner([failure])
    await assert.rejects(packageWithRetry(fixture.options), /packaging failed/)
    assert.equal(fixture.calls, 1)
    assert.deepEqual(fixture.delays, [])
  }
})

async function temporaryDirectory(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "eidos-mac-package-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

test("DMG conversion replaces the input only after attestation and verification", async (t) => {
  const directory = await temporaryDirectory(t)
  const file = path.join(directory, "Eidos Lite.dmg")
  await writeFile(file, "UDZO")

  const run = async (command, [action, source, ...args]) => {
    assert.equal(command, "hdiutil")
    if (action === "convert") {
      assert.equal(source, file)
      assert.deepEqual(args.slice(0, 3), ["-format", "ULMO", "-o"])
      await writeFile(args[3], "ULMO")
    } else if (action === "imageinfo") {
      assert.deepEqual(args, ["-format"])
      return { stdout: "ULMO\n" }
    } else {
      assert.equal(action, "verify")
      assert.equal(await readFile(source, "utf8"), "ULMO + ticket")
      assert.equal(await readFile(file, "utf8"), "UDZO")
    }
  }

  await assert.rejects(
    finalizeDmg(
      file,
      async () => {
        throw new Error("notarization rejected")
      },
      run
    ),
    /notarization rejected/
  )
  assert.equal(await readFile(file, "utf8"), "UDZO")
  assert.deepEqual(await readdir(directory), ["Eidos Lite.dmg"])

  await finalizeDmg(file, (image) => appendFile(image, " + ticket"), run)
  assert.equal(await readFile(file, "utf8"), "ULMO + ticket")
  assert.deepEqual(await readdir(directory), ["Eidos Lite.dmg"])
})

test("macOS metadata checks ship ZIP first and rejects stale DMG metadata or blockmaps", async (t) => {
  const directory = await temporaryDirectory(t)
  const stem = "Eidos Lite-0.36.1-beta.2-mac-x64"
  const [zip, dmg] = await Promise.all(
    ["zip", "dmg"].map(async (extension) => {
      const url = `${stem}.${extension}`
      const bytes = Buffer.from(`${extension} fixture`)
      const file = path.join(directory, url)
      const size = bytes.length
      const blockmap = {
        version: "2",
        files: [{ offset: 0, sizes: [size], checksums: ["fixture"] }],
      }
      await writeFile(file, bytes)
      await writeFile(`${file}.blockmap`, gzipSync(JSON.stringify(blockmap)))
      return {
        url,
        size,
        sha512: createHash("sha512").update(bytes).digest("base64"),
      }
    })
  )
  const metadata = {
    version: "0.36.1-beta.2",
    path: zip.url,
    sha512: zip.sha512,
    files: [zip, dmg],
  }
  const manifest = path.join(directory, "latest-mac.yml")
  const verify = () =>
    verifyMacUpdateInfo(directory, "Eidos Lite", metadata.version, "x64")
  await writeFile(manifest, stringify(metadata))
  await verify()

  await writeFile(manifest, stringify({ ...metadata, path: dmg.url }))
  await assert.rejects(verify, /expected ZIP then DMG/)
  await writeFile(
    manifest,
    stringify({ ...metadata, files: [zip, { ...dmg, sha512: zip.sha512 }] })
  )
  await assert.rejects(verify, /metadata does not match .*\.dmg/)

  await writeFile(manifest, stringify(metadata))
  await writeFile(
    path.join(directory, `${dmg.url}.blockmap`),
    gzipSync(
      JSON.stringify({
        version: "2",
        files: [{ offset: 0, sizes: [dmg.size + 1], checksums: ["old"] }],
      })
    )
  )
  await assert.rejects(verify, /blockmap does not cover .*\.dmg/)
})
