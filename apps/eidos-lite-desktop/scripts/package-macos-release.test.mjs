import assert from "node:assert/strict"
import test from "node:test"
import { packageWithRetry } from "./package-macos-release.mjs"

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
