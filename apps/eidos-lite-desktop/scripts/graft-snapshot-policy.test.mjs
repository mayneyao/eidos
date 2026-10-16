import assert from "node:assert/strict"
import test from "node:test"
import { usesGraftSourceSnapshot } from "./graft-snapshot-policy.mjs"

const lite = { dependencies: { "@eidos.space/graft": "0.3.30" } }

test("only the explicit matching vendored SDK enables source preparation", () => {
  assert.equal(
    usesGraftSourceSnapshot(
      {
        overrides: {
          "@eidos.space/graft":
            "file:vendor/graft-e2ee/eidos.space-graft-0.3.30.tgz",
        },
      },
      lite
    ),
    true
  )
  for (const override of [
    undefined,
    "0.3.31",
    "file:vendor/graft-e2ee/eidos.space-graft-0.3.29.tgz",
    "file:/tmp/graft.tgz",
    "link:../graft/packages/graft-sdk",
  ]) {
    assert.equal(
      usesGraftSourceSnapshot(
        { overrides: { "@eidos.space/graft": override } },
        lite
      ),
      false
    )
  }
  assert.equal(usesGraftSourceSnapshot({}, lite), false)
})
